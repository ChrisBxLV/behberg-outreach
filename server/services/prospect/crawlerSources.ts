/**
 * Superadmin "crawler sources" use canonical kind `wikidata` while the DB stores
 * per-region rows as `wikidata_region` (legacy `wikidata` is normalized on boot).
 */

import { inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectCrawlSeeds, type ProspectCrawlSeed } from "../../../drizzle/schema";
import { prospectEnableSerpSources } from "./env";
import { invalidateProspectSeedKindEnabledCache } from "./crawler";
import { seedProspectDb } from "./seedProspectDb";

export const PROSPECT_CRAWLER_CANONICAL_KINDS = [
  "wikidata",
  "sec_edgar",
  "uk_ch",
  "linkedin_company_serp",
  "linkedin_employee_serp_promote",
] as const;

export type ProspectCrawlerCanonicalKind = (typeof PROSPECT_CRAWLER_CANONICAL_KINDS)[number];

const CANONICAL_LABELS: Record<ProspectCrawlerCanonicalKind, string> = {
  wikidata: "Wikidata",
  sec_edgar: "SEC EDGAR",
  uk_ch: "UK Companies House",
  linkedin_company_serp: "LinkedIn (SERP) — companies",
  linkedin_employee_serp_promote: "LinkedIn (SERP) — employees",
};

const SERP_LOCK_REASON =
  "LinkedIn SERP sources are disabled because PROSPECT_ENABLE_SERP_SOURCES is not enabled on this server.";

export type CrawlerSourceRow = {
  kind: ProspectCrawlerCanonicalKind;
  label: string;
  enabled: boolean;
  existsInDb: boolean;
  locked: boolean;
  lockReason: string | null;
};

function dbKindsForCanonical(kind: ProspectCrawlerCanonicalKind): string[] {
  return kind === "wikidata" ? ["wikidata_region", "wikidata"] : [kind];
}

function throwNoCrawlSeedRows(canonical: ProspectCrawlerCanonicalKind): never {
  const err = new Error(
    `No ${canonical} crawl seed rows exist yet. Run Prospect DB initialization or ensure migrations are applied.`,
  );
  (err as any).code = "PRECONDITION_FAILED";
  throw err;
}

/**
 * Drizzle mysql2 DML often resolves to `[ResultSetHeader, FieldPacket[]]` from `mysql2`.
 * Reading `affectedRows` on the array yields `undefined`, which was misread as `0`.
 */
function mysqlMutationAffectedRows(result: unknown): number {
  const header =
    Array.isArray(result) && result.length > 0
      ? (result[0] as { affectedRows?: number | bigint })
      : (result as { affectedRows?: number | bigint } | null);
  const raw = header?.affectedRows;
  if (raw === undefined || raw === null) return 0;
  const n = typeof raw === "bigint" ? Number(raw) : raw;
  return Number.isFinite(n) ? n : 0;
}

type ProspectDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** MySQL UPDATE `affectedRows` counts *changed* rows; use this when `affectedRows === 0` to distinguish no match vs idempotent no-op. */
async function countProspectCrawlSeedsForWhere(db: ProspectDb, where: SQL): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(prospectCrawlSeeds).where(where);
  return Number(row?.n ?? 0);
}

export function isSerpCanonicalKind(kind: ProspectCrawlerCanonicalKind): boolean {
  return kind === "linkedin_company_serp" || kind === "linkedin_employee_serp_promote";
}

export function isSerpLockedByEnv(): boolean {
  return !prospectEnableSerpSources();
}

export function buildCrawlerSourceRows(rows: ProspectCrawlSeed[]): CrawlerSourceRow[] {
  const serpLocked = isSerpLockedByEnv();
  const out: CrawlerSourceRow[] = [];

  for (const canonical of PROSPECT_CRAWLER_CANONICAL_KINDS) {
    const dbKinds = dbKindsForCanonical(canonical);
    const subset = rows.filter(r => dbKinds.includes(r.kind));
    const existsInDb = subset.length > 0;
    const locked = isSerpCanonicalKind(canonical) && serpLocked;
    const lockReason = locked ? SERP_LOCK_REASON : null;

    const rawAllOn = existsInDb && subset.every(r => r.enabled);
    const enabled = locked ? false : rawAllOn;

    out.push({
      kind: canonical,
      label: CANONICAL_LABELS[canonical],
      enabled,
      existsInDb,
      locked,
      lockReason,
    });
  }
  return out;
}

export async function loadCrawlSeedRowsForSources(): Promise<ProspectCrawlSeed[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(prospectCrawlSeeds)
    .where(
      inArray(prospectCrawlSeeds.kind, [
        "wikidata_region",
        "wikidata",
        "sec_edgar",
        "uk_ch",
        "linkedin_company_serp",
        "linkedin_employee_serp_promote",
      ]),
    );
}

export async function getCrawlerSourcesSnapshot(): Promise<CrawlerSourceRow[]> {
  await seedProspectDb();
  const rows = await loadCrawlSeedRowsForSources();
  return buildCrawlerSourceRows(rows);
}

/**
 * Toggle a canonical source. Does not run crawler ticks.
 * @throws Error with message for TRPC BAD_REQUEST / FORBIDDEN mapping
 */
export async function applyCrawlerSourceEnabled(
  canonical: ProspectCrawlerCanonicalKind,
  enabled: boolean,
): Promise<{ affectedRows: number }> {
  if (isSerpCanonicalKind(canonical) && isSerpLockedByEnv() && enabled) {
    const err = new Error("Cannot enable LinkedIn SERP sources while PROSPECT_ENABLE_SERP_SOURCES is disabled.");
    (err as any).code = "FORBIDDEN";
    throw err;
  }

  const db = await getDb();
  if (!db) {
    const err = new Error("Database unavailable.");
    (err as any).code = "INTERNAL_SERVER_ERROR";
    throw err;
  }

  await seedProspectDb();

  const dbKinds = dbKindsForCanonical(canonical);
  const whereKind = inArray(prospectCrawlSeeds.kind, dbKinds);

  if (enabled) {
    // Use server clock so `nextRunAt` almost always differs from the stored value; otherwise MySQL can report
    // 0 rows *changed* when the row is already enabled with identical values, and the row is never updated
    // (stale `nextRunAt` — seeds would not become due for an immediate tick).
    const enableSet = {
      enabled: true as const,
      nextRunAt: sql`UTC_TIMESTAMP(6)`,
      consecutiveErrors: 0,
    };
    const res = await db.update(prospectCrawlSeeds).set(enableSet).where(whereKind);
    let affected = mysqlMutationAffectedRows(res);
    if (affected === 0) {
      const stillThere = await countProspectCrawlSeedsForWhere(db, whereKind);
      if (stillThere === 0) {
        throwNoCrawlSeedRows(canonical);
      }
      const resBump = await db
        .update(prospectCrawlSeeds)
        .set({
          enabled: true,
          nextRunAt: sql`UTC_TIMESTAMP(6) + INTERVAL 1 MICROSECOND`,
          consecutiveErrors: 0,
        })
        .where(whereKind);
      affected = mysqlMutationAffectedRows(resBump);
    }
    invalidateProspectSeedKindEnabledCache();
    return { affectedRows: affected };
  }

  const res = await db
    .update(prospectCrawlSeeds)
    .set({ enabled: false })
    .where(whereKind);
  const affected = mysqlMutationAffectedRows(res);
  if (affected === 0) {
    const stillThere = await countProspectCrawlSeedsForWhere(db, whereKind);
    if (stillThere === 0) {
      throwNoCrawlSeedRows(canonical);
    }
  }
  invalidateProspectSeedKindEnabledCache();
  return { affectedRows: affected };
}
