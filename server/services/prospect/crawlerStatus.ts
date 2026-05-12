import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  prospectCrawlQueue,
  prospectCrawlRuns,
  prospectCrawlSeeds,
  prospectDailyBudget,
} from "../../../drizzle/schema";
import { prospectEnableSerpSources } from "./env";
import {
  getCrawlerInfraSnapshot,
  getProspectCrawlerRuntimeSettings,
} from "./crawlerSettings";
import { dailyBudget, prospectBudgetBucketDayUtc } from "./throttle";
import { isProspectCrawlerDisabled } from "./crawler";

export type ProspectCrawlerDerivedStatus =
  | "disabled"
  | "idle"
  | "running"
  | "has_errors"
  | "waiting_for_seed"
  | "budget_exhausted";

export type ProspectCrawlerStatusPayload = {
  schemaReady: boolean;
  derivedStatus: ProspectCrawlerDerivedStatus;
  runtime: {
    crawlerEnabledBySettings: boolean;
    disabledByEnv: boolean;
    serpSourcesEnabled: boolean;
    dataMode: string;
    respectRobotsTxt: boolean;
    aiExtractionEnabled: boolean;
    outboundIpConfigured: boolean;
    crawlerPublicUrl: string;
    crawlerUserAgent: string;
    databaseConfigured: boolean;
  };
  queue: {
    byStatus: Array<{ status: string; count: number }>;
    byKindStatus: Array<{ kind: string; status: string; count: number }>;
    oldestPendingAt: string | null;
    inFlightJobs: Array<{
      id: number;
      kind: string;
      lockedBy: string | null;
      lockedAt: string | null;
      attempts: number;
    }>;
    deadCount: number;
    inFlightCount: number;
    lastDeadErrorMessage: string | null;
  };
  seeds: {
    total: number;
    enabled: number;
    dueNow: number;
    nextDueAt: string | null;
    rows: Array<{
      id: number;
      kind: string;
      enabled: boolean;
      region: string;
      lastRunAt: string | null;
      nextRunAt: string | null;
      consecutiveErrors: number;
    }>;
  };
  recentRuns: Array<{
    id: number;
    kind: string;
    status: string;
    itemsFound: number;
    itemsNew: number;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  budget: {
    bucketDay: string;
    http: { cap: number; consumed: number };
    serp: { cap: number; consumed: number };
  };
};

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

async function probeProspectSchema(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<boolean> {
  try {
    await Promise.all([
      db.select({ n: sql<number>`1` }).from(prospectCrawlSeeds).limit(1),
      db.select({ n: sql<number>`1` }).from(prospectCrawlQueue).limit(1),
    ]);
    return true;
  } catch {
    return false;
  }
}

const SEED_ROW_CAP = 300;

export async function getProspectCrawlerStatus(): Promise<ProspectCrawlerStatusPayload> {
  const serp = prospectEnableSerpSources();
  const infra = getCrawlerInfraSnapshot(serp);
  const disabledByEnv = isProspectCrawlerDisabled();
  const runtimeSettings = await getProspectCrawlerRuntimeSettings();
  // One snapshot for HTTP cap: `dailyBudget("http")` calls `getProspectCrawlerRuntimeSettings()` again and can disagree after the 5s cache window.
  const httpBudgetCap = runtimeSettings.dailyHttpBudget;
  const serpBudgetCap = await dailyBudget("serp");
  const db = await getDb();

  const baseRuntime = {
    crawlerEnabledBySettings: runtimeSettings.crawlerEnabled,
    disabledByEnv,
    serpSourcesEnabled: serp,
    dataMode: runtimeSettings.dataMode,
    respectRobotsTxt: runtimeSettings.respectRobotsTxt,
    aiExtractionEnabled: runtimeSettings.aiExtractionEnabled,
    outboundIpConfigured: infra.outboundIpConfigured,
    crawlerPublicUrl: infra.crawlerPublicUrl,
    crawlerUserAgent: infra.crawlerUserAgent,
    databaseConfigured: Boolean(db),
  };

  if (!db) {
    return {
      schemaReady: false,
      derivedStatus: "disabled",
      runtime: baseRuntime,
      queue: {
        byStatus: [],
        byKindStatus: [],
        oldestPendingAt: null,
        inFlightJobs: [],
        deadCount: 0,
        inFlightCount: 0,
        lastDeadErrorMessage: null,
      },
      seeds: { total: 0, enabled: 0, dueNow: 0, nextDueAt: null, rows: [] },
      recentRuns: [],
      budget: {
        bucketDay: prospectBudgetBucketDayUtc(),
        http: { cap: httpBudgetCap, consumed: 0 },
        serp: { cap: serpBudgetCap, consumed: 0 },
      },
    };
  }

  const schemaReady = await probeProspectSchema(db);
  if (!schemaReady) {
    return {
      schemaReady: false,
      derivedStatus: "waiting_for_seed",
      runtime: baseRuntime,
      queue: {
        byStatus: [],
        byKindStatus: [],
        oldestPendingAt: null,
        inFlightJobs: [],
        deadCount: 0,
        inFlightCount: 0,
        lastDeadErrorMessage: null,
      },
      seeds: { total: 0, enabled: 0, dueNow: 0, nextDueAt: null, rows: [] },
      recentRuns: [],
      budget: {
        bucketDay: prospectBudgetBucketDayUtc(),
        http: { cap: httpBudgetCap, consumed: 0 },
        serp: { cap: serpBudgetCap, consumed: 0 },
      },
    };
  }

  const now = new Date();
  const bucketDay = prospectBudgetBucketDayUtc();

  const [
    byStatusRows,
    byKindStatusRows,
    oldestPendingRow,
    inFlightRows,
    lastDeadRow,
    seedAgg,
    dueNowRow,
    nextDueRow,
    seedRows,
    recentRunRows,
    budgetRows,
  ] = await Promise.all([
    db
      .select({
        status: prospectCrawlQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(prospectCrawlQueue)
      .groupBy(prospectCrawlQueue.status),
    db
      .select({
        kind: prospectCrawlQueue.kind,
        status: prospectCrawlQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(prospectCrawlQueue)
      .groupBy(prospectCrawlQueue.kind, prospectCrawlQueue.status)
      .orderBy(prospectCrawlQueue.kind, prospectCrawlQueue.status),
    db
      .select({ t: sql<Date | null>`MIN(${prospectCrawlQueue.availableAt})` })
      .from(prospectCrawlQueue)
      .where(eq(prospectCrawlQueue.status, "pending")),
    db
      .select({
        id: prospectCrawlQueue.id,
        kind: prospectCrawlQueue.kind,
        lockedBy: prospectCrawlQueue.lockedBy,
        lockedAt: prospectCrawlQueue.lockedAt,
        attempts: prospectCrawlQueue.attempts,
      })
      .from(prospectCrawlQueue)
      .where(eq(prospectCrawlQueue.status, "in_flight"))
      .orderBy(asc(prospectCrawlQueue.lockedAt))
      .limit(50),
    db
      .select({ errorMessage: prospectCrawlQueue.errorMessage })
      .from(prospectCrawlQueue)
      .where(eq(prospectCrawlQueue.status, "dead"))
      .orderBy(desc(prospectCrawlQueue.updatedAt))
      .limit(1),
    db
      .select({
        total: sql<number>`COUNT(*)`,
        enabled: sql<number>`SUM(CASE WHEN ${prospectCrawlSeeds.enabled} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(prospectCrawlSeeds),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(prospectCrawlSeeds)
      .where(
        and(
          eq(prospectCrawlSeeds.enabled, true),
          lte(prospectCrawlSeeds.nextRunAt, now),
        ),
      ),
    db
      .select({ t: sql<Date | null>`MIN(${prospectCrawlSeeds.nextRunAt})` })
      .from(prospectCrawlSeeds)
      .where(eq(prospectCrawlSeeds.enabled, true)),
    db
      .select({
        id: prospectCrawlSeeds.id,
        kind: prospectCrawlSeeds.kind,
        enabled: prospectCrawlSeeds.enabled,
        region: prospectCrawlSeeds.region,
        lastRunAt: prospectCrawlSeeds.lastRunAt,
        nextRunAt: prospectCrawlSeeds.nextRunAt,
        consecutiveErrors: prospectCrawlSeeds.consecutiveErrors,
      })
      .from(prospectCrawlSeeds)
      .orderBy(asc(prospectCrawlSeeds.kind), asc(prospectCrawlSeeds.region))
      .limit(SEED_ROW_CAP),
    db
      .select({
        id: prospectCrawlRuns.id,
        kind: prospectCrawlRuns.kind,
        status: prospectCrawlRuns.status,
        itemsFound: prospectCrawlRuns.itemsFound,
        itemsNew: prospectCrawlRuns.itemsNew,
        errorMessage: prospectCrawlRuns.errorMessage,
        startedAt: prospectCrawlRuns.startedAt,
        finishedAt: prospectCrawlRuns.finishedAt,
      })
      .from(prospectCrawlRuns)
      .orderBy(desc(prospectCrawlRuns.startedAt))
      .limit(20),
    db
      .select({
        bucketKind: prospectDailyBudget.bucketKind,
        consumed: prospectDailyBudget.consumed,
      })
      .from(prospectDailyBudget)
      .where(eq(prospectDailyBudget.bucketDay, bucketDay)),
  ]);

  const httpBudgetRow = budgetRows.find(r => r.bucketKind === "http");
  const serpBudgetRow = budgetRows.find(r => r.bucketKind === "serp");
  const httpConsumed = Number(httpBudgetRow?.consumed ?? 0);
  const serpConsumed = Number(serpBudgetRow?.consumed ?? 0);

  const byStatus = byStatusRows.map(r => ({
    status: String(r.status ?? ""),
    count: Number(r.count ?? 0),
  }));
  const byKindStatus = byKindStatusRows.map(r => ({
    kind: String(r.kind ?? ""),
    status: String(r.status ?? ""),
    count: Number(r.count ?? 0),
  }));

  const deadCount = byStatus.find(s => s.status === "dead")?.count ?? 0;
  const inFlightCount = byStatus.find(s => s.status === "in_flight")?.count ?? 0;

  const totalSeeds = Number(seedAgg[0]?.total ?? 0);
  const enabledSeeds = Number(seedAgg[0]?.enabled ?? 0);
  const dueNow = Number(dueNowRow[0]?.n ?? 0);
  const nextDueRaw = nextDueRow[0]?.t;
  const nextDueAt = nextDueRaw instanceof Date ? nextDueRaw.toISOString() : null;

  const recentRuns = recentRunRows.map(r => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    itemsFound: r.itemsFound,
    itemsNew: r.itemsNew,
    errorMessage: r.errorMessage ?? null,
    startedAt: iso(r.startedAt ?? null),
    finishedAt: iso(r.finishedAt ?? null),
  }));

  const recentHasError = recentRuns.some(r => r.status === "error");
  const httpExhausted = httpBudgetCap > 0 && httpConsumed >= httpBudgetCap;
  const serpExhausted = serpBudgetCap > 0 && serpConsumed >= serpBudgetCap;
  const budgetExhausted = httpExhausted || serpExhausted;

  let derivedStatus: ProspectCrawlerDerivedStatus = "idle";
  if (!runtimeSettings.crawlerEnabled || disabledByEnv) {
    derivedStatus = "disabled";
  } else if (inFlightCount > 0) {
    derivedStatus = "running";
  } else if (deadCount > 0 || recentHasError) {
    derivedStatus = "has_errors";
  } else if (totalSeeds === 0) {
    derivedStatus = "waiting_for_seed";
  } else if (budgetExhausted) {
    derivedStatus = "budget_exhausted";
  }

  return {
    schemaReady: true,
    derivedStatus,
    runtime: baseRuntime,
    queue: {
      byStatus,
      byKindStatus,
      oldestPendingAt: oldestPendingRow[0]?.t instanceof Date ? oldestPendingRow[0].t.toISOString() : null,
      inFlightJobs: inFlightRows.map(j => ({
        id: j.id,
        kind: j.kind,
        lockedBy: j.lockedBy ?? null,
        lockedAt: iso(j.lockedAt ?? null),
        attempts: j.attempts,
      })),
      deadCount,
      inFlightCount,
      lastDeadErrorMessage: lastDeadRow[0]?.errorMessage
        ? String(lastDeadRow[0].errorMessage).slice(0, 2000)
        : null,
    },
    seeds: {
      total: totalSeeds,
      enabled: enabledSeeds,
      dueNow,
      nextDueAt,
      rows: seedRows.map(s => ({
        id: s.id,
        kind: s.kind,
        enabled: Boolean(s.enabled),
        region: s.region,
        lastRunAt: iso(s.lastRunAt ?? null),
        nextRunAt: iso(s.nextRunAt ?? null),
        consecutiveErrors: s.consecutiveErrors,
      })),
    },
    recentRuns,
    budget: {
      bucketDay,
      http: { cap: httpBudgetCap, consumed: httpConsumed },
      serp: { cap: serpBudgetCap, consumed: serpConsumed },
    },
  };
}
