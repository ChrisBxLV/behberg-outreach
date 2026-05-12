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
import { getProspectSchedulerActivity } from "./crawlerScheduler";

export type ProspectCrawlerDerivedStatus =
  | "stopped"
  | "paused"
  | "idle"
  | "running"
  | "has_errors"
  | "waiting_for_seed"
  | "budget_exhausted";

export type ProspectCrawlerStatusPayload = {
  schemaReady: boolean;
  derivedStatus: ProspectCrawlerDerivedStatus;
  /** In-process scheduler lane (not DB queue). */
  currentlyRunningStage: "seed" | "company" | "employee" | null;
  scheduler: {
    schedulerEnabled: boolean;
    queuePaused: boolean;
    seedTickIntervalMinutes: number;
    companyQueueTickIntervalMinutes: number;
    employeeQueueTickIntervalMinutes: number;
    lastSeedTickAt: string | null;
    lastCompanyQueueTickAt: string | null;
    lastEmployeeQueueTickAt: string | null;
    nextSeedTickAt: string | null;
    nextCompanyQueueTickAt: string | null;
    nextEmployeeQueueTickAt: string | null;
    lastManualRunAt: string | null;
    lastManualRunByUserId: number | null;
    lastStopAt: string | null;
    lastStopByUserId: number | null;
  };
  effectiveSettings: {
    dailyHttpBudget: number;
    maxPerTick: number;
    fetchTimeoutMs: number;
    fetchMaxBytes: number;
    respectRobotsTxt: boolean;
    aiExtractionEnabled: boolean;
    dataMode: string;
    caps: { maxHttpBudget: number; maxPerTick: number; maxFetchBytes: number };
  };
  recentErrors: Array<{ source: string; message: string; at: string | null }>;
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

function stageFromQueueKind(kind: string): "company" | "employee" | null {
  if (kind === "resolve_domain" || kind === "crawl_website") return "company";
  if (kind === "harvest_employee" || kind === "guess_emails" || kind === "verify_mx") return "employee";
  return null;
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

type RuntimeSnap = Awaited<ReturnType<typeof getProspectCrawlerRuntimeSettings>>;

function schedulerFromRuntime(rs: RuntimeSnap) {
  return {
    schedulerEnabled: rs.schedulerEnabled,
    queuePaused: rs.queuePaused,
    seedTickIntervalMinutes: rs.seedTickIntervalMinutes,
    companyQueueTickIntervalMinutes: rs.companyQueueTickIntervalMinutes,
    employeeQueueTickIntervalMinutes: rs.employeeQueueTickIntervalMinutes,
    lastSeedTickAt: iso(rs.lastSeedTickAt),
    lastCompanyQueueTickAt: iso(rs.lastCompanyQueueTickAt),
    lastEmployeeQueueTickAt: iso(rs.lastEmployeeQueueTickAt),
    nextSeedTickAt: iso(rs.nextSeedTickAt),
    nextCompanyQueueTickAt: iso(rs.nextCompanyQueueTickAt),
    nextEmployeeQueueTickAt: iso(rs.nextEmployeeQueueTickAt),
    lastManualRunAt: iso(rs.lastManualRunAt),
    lastManualRunByUserId: rs.lastManualRunByUserId,
    lastStopAt: iso(rs.lastStopAt),
    lastStopByUserId: rs.lastStopByUserId,
  };
}

function effectiveFromRuntime(rs: RuntimeSnap, infra: ReturnType<typeof getCrawlerInfraSnapshot>) {
  return {
    dailyHttpBudget: rs.dailyHttpBudget,
    maxPerTick: rs.maxPerTick,
    fetchTimeoutMs: rs.fetchTimeoutMs,
    fetchMaxBytes: rs.fetchMaxBytes,
    respectRobotsTxt: rs.respectRobotsTxt,
    aiExtractionEnabled: rs.aiExtractionEnabled,
    dataMode: rs.dataMode,
    caps: infra.caps,
  };
}

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
    const derivedStatus: ProspectCrawlerDerivedStatus = disabledByEnv || !runtimeSettings.crawlerEnabled ? "stopped" : "idle";
    return {
      schemaReady: false,
      derivedStatus,
      currentlyRunningStage: null,
      scheduler: schedulerFromRuntime(runtimeSettings),
      effectiveSettings: effectiveFromRuntime(runtimeSettings, infra),
      recentErrors: [],
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
    const derivedStatus: ProspectCrawlerDerivedStatus = disabledByEnv || !runtimeSettings.crawlerEnabled ? "stopped" : "waiting_for_seed";
    return {
      schemaReady: false,
      derivedStatus,
      currentlyRunningStage: null,
      scheduler: schedulerFromRuntime(runtimeSettings),
      effectiveSettings: effectiveFromRuntime(runtimeSettings, infra),
      recentErrors: [],
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

  const lastDeadMsg = lastDeadRow[0]?.errorMessage ? String(lastDeadRow[0].errorMessage).slice(0, 2000) : null;
  const recentErrors: ProspectCrawlerStatusPayload["recentErrors"] = [];
  if (lastDeadMsg) {
    recentErrors.push({ source: "queue:dead", message: lastDeadMsg.slice(0, 500), at: null });
  }
  for (const r of recentRuns) {
    if (r.status === "error" && r.errorMessage) {
      recentErrors.push({
        source: `run:${r.kind}`,
        message: String(r.errorMessage).slice(0, 500),
        at: r.finishedAt ?? r.startedAt,
      });
    }
  }

  const schedAct = getProspectSchedulerActivity().stage;
  const queueStage = inFlightRows[0] ? stageFromQueueKind(String(inFlightRows[0].kind ?? "")) : null;
  const currentlyRunningStage: ProspectCrawlerStatusPayload["currentlyRunningStage"] = schedAct ?? queueStage;

  let derivedStatus: ProspectCrawlerDerivedStatus = "idle";
  if (disabledByEnv || !runtimeSettings.crawlerEnabled) {
    derivedStatus = "stopped";
  } else if (schedAct != null || inFlightCount > 0) {
    derivedStatus = "running";
  } else if (deadCount > 0 || recentHasError) {
    derivedStatus = "has_errors";
  } else if (budgetExhausted) {
    derivedStatus = "budget_exhausted";
  } else if (runtimeSettings.schedulerEnabled && runtimeSettings.queuePaused) {
    derivedStatus = "paused";
  } else if (totalSeeds === 0) {
    derivedStatus = "waiting_for_seed";
  }

  return {
    schemaReady: true,
    derivedStatus,
    currentlyRunningStage,
    scheduler: schedulerFromRuntime(runtimeSettings),
    effectiveSettings: effectiveFromRuntime(runtimeSettings, infra),
    recentErrors: recentErrors.slice(0, 25),
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
      lastDeadErrorMessage: lastDeadMsg,
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
