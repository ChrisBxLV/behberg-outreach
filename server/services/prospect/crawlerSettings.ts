import net from "node:net";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectCrawlerSettings } from "../../../drizzle/schema";

const SETTINGS_ROW_ID = 1;
const CACHE_MS = 5_000;

export const PROSPECT_DATA_MODES = ["company_safe", "business_contacts"] as const;
export type ProspectDataMode = (typeof PROSPECT_DATA_MODES)[number];

export type ProspectCrawlerRuntimeSettings = {
  crawlerEnabled: boolean;
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

function normalizeDataMode(raw: string | null | undefined): ProspectDataMode {
  const v = (raw ?? "company_safe").trim();
  return (PROSPECT_DATA_MODES as readonly string[]).includes(v) ? (v as ProspectDataMode) : "company_safe";
}

function toRuntime(row: typeof prospectCrawlerSettings.$inferSelect): ProspectCrawlerRuntimeSettings {
  const httpCap = prospectMaxHttpBudgetLimit();
  const tickCap = prospectMaxPerTickLimit();
  const bytesCap = prospectMaxFetchBytesLimit();
  return {
    crawlerEnabled: Boolean(row.crawlerEnabled),
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

export async function isProspectCrawlerEnabledBySettings(): Promise<boolean> {
  const s = await getProspectCrawlerRuntimeSettings();
  return s.crawlerEnabled;
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
