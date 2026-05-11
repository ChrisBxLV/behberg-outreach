// One-shot seeder. Idempotent. Runs on boot to populate `industries` and
// `prospect_crawl_seeds` if those tables are empty. Safe to call multiple
// times; existing rows are not duplicated.

import { inArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  industries,
  prospectCrawlSeeds,
  type InsertProspectCrawlSeed,
} from "../../../drizzle/schema";
import { flattenIndustriesForDb } from "./industryTaxonomy";
import { REGION_SEEDS } from "./regionSeed";
import { prospectEnableSerpSources } from "./env";

let industriesSeeded = false;

export async function seedProspectDb(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  if (!industriesSeeded) {
    await seedIndustries(db);
    industriesSeeded = true;
  }
  await seedCrawlSeeds(db);
  await disableLinkedinSerpSeedsIfEnvOff(db);
}

async function seedIndustries(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const rows = flattenIndustriesForDb();
  if (rows.length === 0) return;
  // Insert ignore semantics via ON DUPLICATE KEY UPDATE no-op.
  for (const row of rows) {
    try {
      await db
        .insert(industries)
        .values({ code: row.code, label: row.label, parentCode: row.parentCode })
        .onDuplicateKeyUpdate({ set: { label: row.label, parentCode: row.parentCode } });
    } catch (err: any) {
      console.warn(`[ProspectSeed] industry insert failed (${row.code}):`, err?.message ?? err);
    }
  }
}

async function seedCrawlSeeds(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const existing = await db
    .select({ kind: prospectCrawlSeeds.kind, region: prospectCrawlSeeds.region })
    .from(prospectCrawlSeeds);
  const existingKey = new Set(existing.map(r => `${r.kind}::${r.region}`));

  const seeds: InsertProspectCrawlSeed[] = [];
  const now = new Date();

  // Wikidata: one SPARQL seed per region. Cadence keeps things polite.
  for (const region of REGION_SEEDS) {
    const key = `wikidata_region::${region.code}`;
    if (existingKey.has(key)) continue;
    seeds.push({
      kind: "wikidata_region",
      region: region.code,
      payload: {
        countryCode: region.country,
        admin1: region.admin1 ?? null,
        wikidataQid: region.wikidataQid ?? null,
        label: region.label,
      },
      frequencyMinutes: 7 * 24 * 60, // weekly
      enabled: true,
      nextRunAt: stagger(now, region.code, 7 * 24 * 60),
    });
  }

  // LinkedIn SERP for company discovery — fanned out by region.
  if (prospectEnableSerpSources()) {
    for (const region of REGION_SEEDS) {
      const key = `linkedin_company_serp::${region.code}`;
      if (existingKey.has(key)) continue;
      seeds.push({
        kind: "linkedin_company_serp",
        region: region.code,
        payload: {
          searchHint: region.searchHint,
          countryCode: region.country,
          admin1: region.admin1 ?? null,
        },
        frequencyMinutes: 24 * 60, // daily
        enabled: true,
        nextRunAt: stagger(now, region.code, 24 * 60),
      });
    }
  }

  // LinkedIn SERP for employee discovery is queued *per company* (kind=linkedin_employee_serp)
  // by the company tick. We still register a global "tick" seed so the cron worker can
  // promote companies into the employee discovery queue if no other path enqueues them.
  if (prospectEnableSerpSources()) {
    const key = `linkedin_employee_serp_promote::global`;
    if (!existingKey.has(key)) {
      seeds.push({
        kind: "linkedin_employee_serp_promote",
        region: "global",
        payload: {},
        frequencyMinutes: 6 * 60, // every 6h
        enabled: true,
        nextRunAt: new Date(now.getTime() + 60_000),
      });
    }
  }

  // SEC EDGAR feed (US public companies). Country-scoped only.
  if (!existingKey.has("sec_edgar::US")) {
    seeds.push({
      kind: "sec_edgar",
      region: "US",
      payload: {},
      frequencyMinutes: 7 * 24 * 60,
      enabled: true,
      nextRunAt: stagger(now, "US", 7 * 24 * 60),
    });
  }

  // UK Companies House.
  if (!existingKey.has("uk_ch::GB")) {
    seeds.push({
      kind: "uk_ch",
      region: "GB",
      payload: {},
      frequencyMinutes: 7 * 24 * 60,
      enabled: true,
      nextRunAt: stagger(now, "GB", 7 * 24 * 60),
    });
  }

  // Insert in chunks to keep MySQL happy.
  for (const chunk of chunkArray(seeds, 50)) {
    try {
      await db.insert(prospectCrawlSeeds).values(chunk);
    } catch (err: any) {
      console.warn(`[ProspectSeed] crawl seed insert failed:`, err?.message ?? err);
    }
  }

  if (seeds.length > 0) {
    console.log(`[ProspectSeed] Inserted ${seeds.length} crawl seeds.`);
  }
}

/** Env-only kill switch: never treat SERP seeds as enabled when the server forbids SERP. */
async function disableLinkedinSerpSeedsIfEnvOff(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
): Promise<void> {
  if (prospectEnableSerpSources()) return;
  try {
    await db
      .update(prospectCrawlSeeds)
      .set({ enabled: false })
      .where(inArray(prospectCrawlSeeds.kind, ["linkedin_company_serp", "linkedin_employee_serp_promote"]));
    const { invalidateProspectSeedKindEnabledCache } = await import("./crawler");
    invalidateProspectSeedKindEnabledCache();
  } catch (err: any) {
    console.warn(`[ProspectSeed] disable SERP seeds failed:`, err?.message ?? err);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Spread out initial nextRunAt across the cadence window so we don't hammer
 * SERP providers right after boot when many regions kick in at once.
 */
function stagger(now: Date, key: string, cadenceMinutes: number): Date {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  const offsetMinutes = Math.abs(h) % Math.max(1, Math.floor(cadenceMinutes / 4));
  return new Date(now.getTime() + (offsetMinutes + 1) * 60_000);
}
