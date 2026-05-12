import net from "node:net";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectCrawlerSettings } from "../../../drizzle/schema";

const SETTINGS_ROW_ID = 1;
const CACHE_MS = 5_000;

export const PROSPECT_DATA_MODES = ["company_safe", "business_contacts"] as const;
export type ProspectDataMode = (typeof PROSPECT_DATA_MODES)[number];

/** Max interval between scheduled ticks (7 days). */
export const PROSPECT_SCHEDULER_MAX_INTERVAL_MINUTES = 7 * 24 * 60;
export const PROSPECT_SCHEDULER_MIN_SEED_MINUTES = 15;
export const PROSPECT_SCHEDULER_MIN_COMPANY_QUEUE_MINUTES = 5;
export const PROSPECT_SCHEDULER_MIN_EMPLOYEE_QUEUE_MINUTES = 15;

export type ProspectCrawlerRuntimeSettings = {
  crawlerEnabled: boolean;
  schedulerEnabled: boolean;
  queuePaused: boolean;
  seedTickIntervalMinutes: number;
  companyQueueTickIntervalMinutes: number;
  employeeQueueTickIntervalMinutes: number;
  lastSeedTickAt: Date | null;
  lastCompanyQueueTickAt: Date | null;
  lastEmployeeQueueTickAt: Date | null;
  nextSeedTickAt: Date | null;
  nextCompanyQueueTickAt: Date | null;
  nextEmployeeQueueTickAt: Date | null;
  lastManualRunAt: Date | null;
  lastManualRunByUserId: number | null;
  lastStopAt: Date | null;
  lastStopByUserId: number | null;
  dataMode: ProspectDataMode;
  dailyHttpBudget: number;
  maxPerTick: number;
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  respectRobotsTxt: boolean;
  aiExtractionEnabled: boolean;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Hard ceiling for daily HTTP budget (DB/UI cannot exceed). */
export function prospectMaxHttpBudgetLimit(): number {
  return envInt("PROSPECT_MAX_HTTP_BUDGET_LIMIT", 500);
}

/** Hard ceiling for max jobs per crawler tick. */
export function prospectMaxPerTickLimit(): number {
  return envInt("PROSPECT_MAX_PER_TICK_LIMIT", 25);
}

/** Hard ceiling for single-fetch body size (bytes). */
export function prospectMaxFetchBytesLimit(): number {
  return envInt("PROSPECT_MAX_FETCH_BYTES_LIMIT", 2_000_000);
}

const DEFAULT_RUNTIME: ProspectCrawlerRuntimeSettings = {
  crawlerEnabled: false,
  schedulerEnabled: false,
  queuePaused: false,
  seedTickIntervalMinutes: 60,
  companyQueueTickIntervalMinutes: 10,
  employeeQueueTickIntervalMinutes: 30,
  lastSeedTickAt: null,
  lastCompanyQueueTickAt: null,
  lastEmployeeQueueTickAt: null,
  nextSeedTickAt: null,
  nextCompanyQueueTickAt: null,
  nextEmployeeQueueTickAt: null,
  lastManualRunAt: null,
  lastManualRunByUserId: null,
  lastStopAt: null,
  lastStopByUserId: null,
  dataMode: "company_safe",
  dailyHttpBudget: 50,
  maxPerTick: 5,
  fetchTimeoutMs: 8000,
  fetchMaxBytes: 1_000_000,
  respectRobotsTxt: true,
  aiExtractionEnabled: false,
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Superadmin UI / API: clamp to same bounds as `toRuntime` before persisting. */
export type ProspectCrawlerSettingsPersistInput = {
  crawlerEnabled: boolean;
  dataMode: ProspectDataMode;
  dailyHttpBudget: number;
  maxPerTick: number;
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  respectRobotsTxt: boolean;
  aiExtractionEnabled: boolean;
};

export function clampProspectCrawlerSettingsForPersist(
  input: ProspectCrawlerSettingsPersistInput,
): ProspectCrawlerSettingsPersistInput {
  const httpCap = prospectMaxHttpBudgetLimit();
  const tickCap = prospectMaxPerTickLimit();
  const bytesCap = prospectMaxFetchBytesLimit();
  return {
    crawlerEnabled: Boolean(input.crawlerEnabled),
    dataMode: normalizeDataMode(input.dataMode),
    dailyHttpBudget: clampInt(input.dailyHttpBudget, 1, httpCap),
    maxPerTick: clampInt(input.maxPerTick, 1, tickCap),
    fetchTimeoutMs: clampInt(input.fetchTimeoutMs, 1_000, 120_000),
    fetchMaxBytes: clampInt(input.fetchMaxBytes, 16_384, bytesCap),
    respectRobotsTxt: Boolean(input.respectRobotsTxt),
    aiExtractionEnabled: Boolean(input.aiExtractionEnabled),
  };
}

export type ProspectCrawlerSchedulePersistInput = {
  schedulerEnabled: boolean;
  seedTickIntervalMinutes: number;
  companyQueueTickIntervalMinutes: number;
  employeeQueueTickIntervalMinutes: number;
};

export function clampProspectCrawlerScheduleForPersist(
  input: ProspectCrawlerSchedulePersistInput,
): ProspectCrawlerSchedulePersistInput {
  const maxM = PROSPECT_SCHEDULER_MAX_INTERVAL_MINUTES;
  return {
    schedulerEnabled: Boolean(input.schedulerEnabled),
    seedTickIntervalMinutes: clampInt(input.seedTickIntervalMinutes, PROSPECT_SCHEDULER_MIN_SEED_MINUTES, maxM),
    companyQueueTickIntervalMinutes: clampInt(
      input.companyQueueTickIntervalMinutes,
      PROSPECT_SCHEDULER_MIN_COMPANY_QUEUE_MINUTES,
      maxM,
    ),
    employeeQueueTickIntervalMinutes: clampInt(
      input.employeeQueueTickIntervalMinutes,
      PROSPECT_SCHEDULER_MIN_EMPLOYEE_QUEUE_MINUTES,
      maxM,
    ),
  };
}

function normalizeDataMode(raw: string | null | undefined): ProspectDataMode {
  const v = (raw ?? "company_safe").trim();
  return (PROSPECT_DATA_MODES as readonly string[]).includes(v) ? (v as ProspectDataMode) : "company_safe";
}

function toRuntime(row: typeof prospectCrawlerSettings.$inferSelect): ProspectCrawlerRuntimeSettings {
  const httpCap = prospectMaxHttpBudgetLimit();
  const tickCap = prospectMaxPerTickLimit();
  const bytesCap = prospectMaxFetchBytesLimit();
  const maxM = PROSPECT_SCHEDULER_MAX_INTERVAL_MINUTES;
  return {
    crawlerEnabled: Boolean(row.crawlerEnabled),
    schedulerEnabled: Boolean(row.schedulerEnabled),
    queuePaused: Boolean(row.queuePaused),
    seedTickIntervalMinutes: clampInt(
      Number(row.seedTickIntervalMinutes ?? DEFAULT_RUNTIME.seedTickIntervalMinutes),
      PROSPECT_SCHEDULER_MIN_SEED_MINUTES,
      maxM,
    ),
    companyQueueTickIntervalMinutes: clampInt(
      Number(row.companyQueueTickIntervalMinutes ?? DEFAULT_RUNTIME.companyQueueTickIntervalMinutes),
      PROSPECT_SCHEDULER_MIN_COMPANY_QUEUE_MINUTES,
      maxM,
    ),
    employeeQueueTickIntervalMinutes: clampInt(
      Number(row.employeeQueueTickIntervalMinutes ?? DEFAULT_RUNTIME.employeeQueueTickIntervalMinutes),
      PROSPECT_SCHEDULER_MIN_EMPLOYEE_QUEUE_MINUTES,
      maxM,
    ),
    lastSeedTickAt: asDate(row.lastSeedTickAt),
    lastCompanyQueueTickAt: asDate(row.lastCompanyQueueTickAt),
    lastEmployeeQueueTickAt: asDate(row.lastEmployeeQueueTickAt),
    nextSeedTickAt: asDate(row.nextSeedTickAt),
    nextCompanyQueueTickAt: asDate(row.nextCompanyQueueTickAt),
    nextEmployeeQueueTickAt: asDate(row.nextEmployeeQueueTickAt),
    lastManualRunAt: asDate(row.lastManualRunAt),
    lastManualRunByUserId: row.lastManualRunByUserId != null ? Number(row.lastManualRunByUserId) : null,
    lastStopAt: asDate(row.lastStopAt),
    lastStopByUserId: row.lastStopByUserId != null ? Number(row.lastStopByUserId) : null,
    dataMode: normalizeDataMode(row.dataMode),
    dailyHttpBudget: clampInt(Number(row.dailyHttpBudget ?? DEFAULT_RUNTIME.dailyHttpBudget), 1, httpCap),
    maxPerTick: clampInt(Number(row.maxPerTick ?? DEFAULT_RUNTIME.maxPerTick), 1, tickCap),
    fetchTimeoutMs: clampInt(Number(row.fetchTimeoutMs ?? DEFAULT_RUNTIME.fetchTimeoutMs), 1_000, 120_000),
    fetchMaxBytes: clampInt(Number(row.fetchMaxBytes ?? DEFAULT_RUNTIME.fetchMaxBytes), 16_384, bytesCap),
    respectRobotsTxt: Boolean(row.respectRobotsTxt),
    aiExtractionEnabled: Boolean(row.aiExtractionEnabled),
  };
}

let cache: { at: number; value: ProspectCrawlerRuntimeSettings } | null = null;

export function invalidateProspectCrawlerSettingsCache(): void {
  cache = null;
}

export async function getProspectCrawlerRuntimeSettings(): Promise<ProspectCrawlerRuntimeSettings> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const db = await getDb();
  if (!db) {
    const v = { ...DEFAULT_RUNTIME };
    cache = { at: now, value: v };
    return v;
  }
  try {
    const rows = await db
      .select()
      .from(prospectCrawlerSettings)
      .where(eq(prospectCrawlerSettings.id, SETTINGS_ROW_ID))
      .limit(1);
    const value = rows[0] ? toRuntime(rows[0]) : { ...DEFAULT_RUNTIME };
    cache = { at: now, value };
    return value;
  } catch {
    const v = { ...DEFAULT_RUNTIME };
    cache = { at: now, value: v };
    return v;
  }
}

/** Scheduled seed tick: crawler + scheduler on; ignores queue pause. */
export async function isProspectScheduledSeedTickAllowed(): Promise<boolean> {
  const s = await getProspectCrawlerRuntimeSettings();
  return s.crawlerEnabled && s.schedulerEnabled;
}

/** Scheduled company/employee queue ticks: also require queue not paused. */
export async function isProspectScheduledQueueTickAllowed(): Promise<boolean> {
  const s = await getProspectCrawlerRuntimeSettings();
  return s.crawlerEnabled && s.schedulerEnabled && !s.queuePaused;
}

/** Next tick time after a successful run from `from` (wall clock). */
export function computeProspectNextSchedulerTick(from: Date, intervalMinutes: number): Date {
  return new Date(from.getTime() + Math.max(1, intervalMinutes) * 60_000);
}

export async function getProspectMaxPerTickEffective(): Promise<number> {
  const s = await getProspectCrawlerRuntimeSettings();
  return s.maxPerTick;
}

export type CrawlerInfraSnapshot = {
  serpSourcesEnabled: boolean;
  crawlerPublicUrl: string;
  crawlerUserAgent: string;
  outboundIpConfigured: boolean;
  caps: {
    maxHttpBudget: number;
    maxPerTick: number;
    maxFetchBytes: number;
  };
};

export function getCrawlerInfraSnapshot(serpSourcesEnabled: boolean): CrawlerInfraSnapshot {
  const ua = process.env.PROSPECT_CRAWLER_USER_AGENT?.trim();
  return {
    serpSourcesEnabled,
    crawlerPublicUrl: process.env.PROSPECT_CRAWLER_PUBLIC_URL?.trim() || "https://crawler.krot.io",
    crawlerUserAgent:
      ua && ua.length > 0 ? ua : "krot.io-prospect-crawler/1.0 (+https://crawler.krot.io)",
    outboundIpConfigured: (() => {
      const raw = process.env.PROSPECT_CRAWLER_OUTBOUND_IP?.trim();
      return Boolean(raw && net.isIP(raw) === 4);
    })(),
    caps: {
      maxHttpBudget: prospectMaxHttpBudgetLimit(),
      maxPerTick: prospectMaxPerTickLimit(),
      maxFetchBytes: prospectMaxFetchBytesLimit(),
    },
  };
}
