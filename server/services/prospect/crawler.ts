// Autonomous prospect crawler orchestrator.
//
// Three cron-driven entry points:
//   tickSeeds()              -> reads `prospect_crawl_seeds` due rows, runs seed adapter, enqueues follow-up jobs
//   tickQueueCompany()       -> processes `resolve_domain` + `crawl_website` jobs
//   tickQueueEmployee()      -> processes `harvest_employee`, `guess_emails`, `verify_mx` jobs
//
// All ticks share per-host throttle, daily HTTP/SERP budgets, and a single FIFO
// queue with priority. The orchestrator never depends on an LLM; classifiers
// and email guesses use deterministic rules.

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  prospectCrawlQueue,
  prospectCrawlRuns,
  prospectCrawlSeeds,
  type ProspectCrawlQueue,
  type ProspectCrawlSeed,
} from "../../../drizzle/schema";
import { checkAndConsumeBudget } from "./throttle";
import { enqueueJobs, getCompanyById } from "./repository";
import type { QueueJobDraft, QueueJobKind, SeedAdapter, SeedRunResult } from "./types";

export const PROSPECT_MAX_PER_TICK = clampInt(process.env.PROSPECT_MAX_PER_TICK, 25, 1, 200);
const PROSPECT_LOCK_OWNER = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

export function isProspectCrawlerDisabled(): boolean {
  const raw = (process.env.DISABLE_PROSPECT_CRAWLER ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/* ------------------------------------------------------------------ */
/* Adapter registry                                                   */
/* ------------------------------------------------------------------ */

const seedAdapters = new Map<string, SeedAdapter>();

export function registerSeedAdapter(adapter: SeedAdapter): void {
  seedAdapters.set(adapter.kind, adapter);
}

let adaptersRegistered = false;
async function ensureAdaptersRegistered(): Promise<void> {
  if (adaptersRegistered) return;
  adaptersRegistered = true;
  try {
    const [{ wikidataSeedAdapter }, { secEdgarSeedAdapter }, { ukCompaniesHouseSeedAdapter }, { linkedinSerpSeedAdapter }, { linkedinEmployeePromoteAdapter }] =
      await Promise.all([
        import("./sources/wikidata"),
        import("./sources/secEdgar"),
        import("./sources/ukCompaniesHouse"),
        import("./sources/linkedinSerp"),
        import("./sources/linkedinEmployeePromote"),
      ]);
    registerSeedAdapter(wikidataSeedAdapter);
    registerSeedAdapter(secEdgarSeedAdapter);
    registerSeedAdapter(ukCompaniesHouseSeedAdapter);
    registerSeedAdapter(linkedinSerpSeedAdapter);
    registerSeedAdapter(linkedinEmployeePromoteAdapter);
  } catch (err: any) {
    console.warn(`[ProspectCrawler] adapter registration failed:`, err?.message ?? err);
  }
}

/* ------------------------------------------------------------------ */
/* Seed tick                                                          */
/* ------------------------------------------------------------------ */

const COMPANY_QUEUE_KINDS: QueueJobKind[] = ["resolve_domain", "crawl_website"];
const EMPLOYEE_QUEUE_KINDS: QueueJobKind[] = ["harvest_employee", "guess_emails", "verify_mx"];

export async function tickSeeds(): Promise<{ processed: number; errors: number }> {
  if (isProspectCrawlerDisabled()) return { processed: 0, errors: 0 };
  await ensureAdaptersRegistered();

  const db = await getDb();
  if (!db) return { processed: 0, errors: 0 };

  const now = new Date();
  const due = await db
    .select()
    .from(prospectCrawlSeeds)
    .where(and(eq(prospectCrawlSeeds.enabled, true), lte(prospectCrawlSeeds.nextRunAt, now)))
    .orderBy(asc(prospectCrawlSeeds.nextRunAt))
    .limit(Math.min(10, PROSPECT_MAX_PER_TICK));

  let processed = 0;
  let errors = 0;
  for (const seed of due) {
    try {
      // Budget category per seed kind.
      //   - linkedin_company_serp: hits SERP providers (Google/DDG/Bing) -> SERP budget.
      //   - linkedin_employee_serp_promote: pure DB read, no outbound calls -> no budget.
      //   - everything else (wikidata, sec_edgar, uk_ch): HTTP API calls -> HTTP budget.
      if (seed.kind === "linkedin_company_serp") {
        const ok = await checkAndConsumeBudget("serp", 1);
        if (!ok) {
          await rescheduleSeed(seed, true);
          continue;
        }
      } else if (seed.kind !== "linkedin_employee_serp_promote") {
        const ok = await checkAndConsumeBudget("http", 1);
        if (!ok) {
          await rescheduleSeed(seed, true);
          continue;
        }
      }

      const adapter = seedAdapters.get(seed.kind);
      if (!adapter) {
        await rescheduleSeed(seed, false);
        continue;
      }
      const startedAt = new Date();
      let result: SeedRunResult;
      try {
        result = await adapter.run({
          seedId: seed.id,
          region: seed.region,
          payload: (seed.payload as Record<string, unknown> | null) ?? null,
        });
      } catch (err: any) {
        errors++;
        await recordRun({
          seedId: seed.id,
          kind: seed.kind,
          startedAt,
          status: "error",
          itemsFound: 0,
          itemsNew: 0,
          errorMessage: err?.message ?? String(err),
        });
        await advanceSeedAfterError(seed);
        continue;
      }
      let itemsNew = 0;
      const followups: QueueJobDraft[] = result.followupJobs ? [...result.followupJobs] : [];
      const { upsertCompany, upsertEmployee } = await import("./repository");
      for (const draft of result.companies) {
        const out = await upsertCompany(draft);
        if (out?.created) {
          itemsNew++;
          followups.push({
            kind: out.company.domain ? "crawl_website" : "resolve_domain",
            payload: { companyId: out.company.id },
            priority: 5,
          });
        } else if (out && !out.company.domain) {
          followups.push({
            kind: "resolve_domain",
            payload: { companyId: out.company.id },
            priority: 3,
          });
        }
      }
      for (const draft of result.employees) {
        const emp = await upsertEmployee(draft);
        if (emp) {
          itemsNew++;
          if (!emp.email && emp.emailStatus === "unknown") {
            followups.push({
              kind: "guess_emails",
              payload: { employeeId: emp.id },
              priority: 2,
            });
          }
        }
      }
      if (followups.length) await enqueueJobs(followups);
      await recordRun({
        seedId: seed.id,
        kind: seed.kind,
        startedAt,
        status: result.throttled ? "throttled" : "ok",
        itemsFound: result.companies.length + result.employees.length,
        itemsNew,
      });
      await advanceSeedAfterSuccess(seed);
      processed++;
    } catch (err: any) {
      errors++;
      console.warn(`[ProspectCrawler] tickSeeds error for seed ${seed.id}:`, err?.message ?? err);
      await advanceSeedAfterError(seed);
    }
  }
  return { processed, errors };
}

async function recordRun(opts: {
  seedId: number;
  kind: string;
  startedAt: Date;
  status: "ok" | "error" | "throttled";
  itemsFound: number;
  itemsNew: number;
  errorMessage?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(prospectCrawlRuns).values({
      seedId: opts.seedId,
      kind: opts.kind,
      status: opts.status,
      itemsFound: opts.itemsFound,
      itemsNew: opts.itemsNew,
      errorMessage: opts.errorMessage ?? null,
      startedAt: opts.startedAt,
      finishedAt: new Date(),
    });
  } catch (err: any) {
    console.warn(`[ProspectCrawler] recordRun failed:`, err?.message ?? err);
  }
}

async function advanceSeedAfterSuccess(seed: ProspectCrawlSeed): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const next = new Date(Date.now() + Math.max(1, seed.frequencyMinutes) * 60_000);
  await db
    .update(prospectCrawlSeeds)
    .set({ lastRunAt: new Date(), nextRunAt: next, consecutiveErrors: 0 })
    .where(eq(prospectCrawlSeeds.id, seed.id));
}

async function rescheduleSeed(seed: ProspectCrawlSeed, throttled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Push the seed out a quarter-cadence so we don't burn CPU on it next tick.
  const wait = Math.max(15, throttled ? 30 : Math.floor(seed.frequencyMinutes / 8)) * 60_000;
  await db
    .update(prospectCrawlSeeds)
    .set({ nextRunAt: new Date(Date.now() + wait) })
    .where(eq(prospectCrawlSeeds.id, seed.id));
}

async function advanceSeedAfterError(seed: ProspectCrawlSeed): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const errors = (seed.consecutiveErrors ?? 0) + 1;
  const enabled = errors >= 5 ? false : true;
  // Backoff multiplier: 2x cadence per consecutive error, capped.
  const backoffMinutes = Math.min(seed.frequencyMinutes * Math.pow(2, errors - 1), 7 * 24 * 60);
  await db
    .update(prospectCrawlSeeds)
    .set({
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + backoffMinutes * 60_000),
      consecutiveErrors: errors,
      enabled,
    })
    .where(eq(prospectCrawlSeeds.id, seed.id));
}

/* ------------------------------------------------------------------ */
/* Queue ticks                                                        */
/* ------------------------------------------------------------------ */

export async function tickQueueCompany(): Promise<{ processed: number; errors: number }> {
  return runTick(COMPANY_QUEUE_KINDS, processCompanyJob);
}

export async function tickQueueEmployee(): Promise<{ processed: number; errors: number }> {
  return runTick(EMPLOYEE_QUEUE_KINDS, processEmployeeJob);
}

async function runTick(
  kinds: QueueJobKind[],
  process: (job: ProspectCrawlQueue) => Promise<void>,
): Promise<{ processed: number; errors: number }> {
  if (isProspectCrawlerDisabled()) return { processed: 0, errors: 0 };
  await ensureAdaptersRegistered();

  const db = await getDb();
  if (!db) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  for (let i = 0; i < PROSPECT_MAX_PER_TICK; i++) {
    const job = await claimNextJob(kinds);
    if (!job) break;
    try {
      await process(job);
      await markJob(job.id, "done");
      processed++;
    } catch (err: any) {
      errors++;
      const attempts = (job.attempts ?? 0) + 1;
      const dead = attempts >= 5;
      await markJob(job.id, dead ? "dead" : "pending", {
        errorMessage: err?.message ?? String(err),
        attempts,
        // Exponential backoff up to ~30m.
        availableAt: new Date(Date.now() + Math.min(30, Math.pow(2, attempts)) * 60_000),
      });
    }
  }
  return { processed, errors };
}

async function claimNextJob(kinds: QueueJobKind[]): Promise<ProspectCrawlQueue | null> {
  const db = await getDb();
  if (!db) return null;
  const candidates = await db
    .select()
    .from(prospectCrawlQueue)
    .where(
      and(
        eq(prospectCrawlQueue.status, "pending"),
        inArray(prospectCrawlQueue.kind, kinds as string[]),
        lte(prospectCrawlQueue.availableAt, new Date()),
      ),
    )
    .orderBy(asc(prospectCrawlQueue.priority), asc(prospectCrawlQueue.id))
    .limit(5);

  for (const row of candidates) {
    // Atomic claim: WHERE status='pending' so two workers can't pull the same row.
    const result = await db
      .update(prospectCrawlQueue)
      .set({
        status: "in_flight",
        lockedBy: PROSPECT_LOCK_OWNER,
        lockedAt: new Date(),
      })
      .where(and(eq(prospectCrawlQueue.id, row.id), eq(prospectCrawlQueue.status, "pending")));
    const affected = Number((result as any)?.affectedRows ?? 0);
    if (affected > 0) return row;
  }
  return null;
}

async function markJob(
  id: number,
  status: "done" | "dead" | "pending",
  fields: { errorMessage?: string; attempts?: number; availableAt?: Date } = {},
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(prospectCrawlQueue)
    .set({
      status,
      errorMessage: fields.errorMessage ?? null,
      attempts: fields.attempts ?? sql`attempts`,
      availableAt: fields.availableAt ?? new Date(),
      lockedBy: null,
      lockedAt: null,
    })
    .where(eq(prospectCrawlQueue.id, id));
}

/* ------------------------------------------------------------------ */
/* Job processors                                                     */
/* ------------------------------------------------------------------ */

async function processCompanyJob(job: ProspectCrawlQueue): Promise<void> {
  const payload = (job.payload as Record<string, unknown>) ?? {};
  const companyId = Number(payload.companyId ?? 0);
  if (!companyId) return;

  if (job.kind === "resolve_domain") {
    const ok = await checkAndConsumeBudget("http", 1);
    if (!ok) throw new Error("daily HTTP budget exhausted");
    const { resolveCompanyDomain } = await import("./domainResolver");
    await resolveCompanyDomain(companyId);
    // After we have a domain, queue a website crawl.
    await enqueueJobs([{ kind: "crawl_website", payload: { companyId }, priority: 4 }]);
    return;
  }

  if (job.kind === "crawl_website") {
    const ok = await checkAndConsumeBudget("http", 1);
    if (!ok) throw new Error("daily HTTP budget exhausted");
    const { crawlCompanyWebsite } = await import("./websiteCrawler");
    await crawlCompanyWebsite(companyId);
    return;
  }
}

async function processEmployeeJob(job: ProspectCrawlQueue): Promise<void> {
  const payload = (job.payload as Record<string, unknown>) ?? {};
  if (job.kind === "harvest_employee") {
    const companyId = Number(payload.companyId ?? 0);
    if (!companyId) return;
    const ok = await checkAndConsumeBudget("serp", 1);
    if (!ok) throw new Error("daily SERP budget exhausted");
    const company = await getCompanyById(companyId);
    if (!company) return;
    const { harvestEmployeesForCompany } = await import("./sources/linkedinSerp");
    await harvestEmployeesForCompany(company);
    return;
  }
  if (job.kind === "guess_emails") {
    const employeeId = Number(payload.employeeId ?? 0);
    if (!employeeId) return;
    const { runEmailWaterfall } = await import("./emailWaterfall");
    await runEmailWaterfall(employeeId);
    return;
  }
  if (job.kind === "verify_mx") {
    const employeeId = Number(payload.employeeId ?? 0);
    if (!employeeId) return;
    const { runEmailWaterfall } = await import("./emailWaterfall");
    await runEmailWaterfall(employeeId);
    return;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
