// Per-host throttle + daily HTTP/SERP budgets. Persists to MySQL so a server
// restart does not erase rate-limit state.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectDailyBudget, prospectHostThrottle } from "../../../drizzle/schema";
import { getProspectCrawlerRuntimeSettings } from "./crawlerSettings";

const DEFAULT_HOST_THROTTLE_MS = 5_000;
const ERROR_HOST_BACKOFF_MS = 60_000;

/** YYYY-MM-DD UTC — matches `prospect_daily_budget.bucketDay`. */
export function prospectBudgetBucketDayUtc(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayKey(): string {
  return prospectBudgetBucketDayUtc();
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function dailyBudget(kind: "http" | "serp"): Promise<number> {
  if (kind === "serp") return envInt("PROSPECT_DAILY_SERP_BUDGET", 300);
  const s = await getProspectCrawlerRuntimeSettings();
  return s.dailyHttpBudget;
}

export async function checkAndConsumeBudget(kind: "http" | "serp", amount = 1): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const budget = await dailyBudget(kind);
  if (budget <= 0) return false;
  const day = todayKey();

  // Ensure row exists for this day+kind.
  await db
    .insert(prospectDailyBudget)
    .values({ bucketDay: day, bucketKind: kind, consumed: 0 })
    .onDuplicateKeyUpdate({ set: { bucketDay: day } });

  const existing = await db
    .select({ consumed: prospectDailyBudget.consumed, id: prospectDailyBudget.id })
    .from(prospectDailyBudget)
    .where(and(eq(prospectDailyBudget.bucketDay, day), eq(prospectDailyBudget.bucketKind, kind)))
    .limit(1);
  const row = existing[0];
  const consumed = row?.consumed ?? 0;
  if (consumed + amount > budget) return false;

  if (row?.id != null) {
    await db
      .update(prospectDailyBudget)
      .set({ consumed: consumed + amount })
      .where(eq(prospectDailyBudget.id, row.id));
  }
  return true;
}

export async function getNextAllowedAt(host: string): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(prospectHostThrottle)
    .where(eq(prospectHostThrottle.host, host));
  return rows[0]?.nextAllowedAt ?? null;
}

export async function isHostAllowed(host: string): Promise<boolean> {
  const nextAt = await getNextAllowedAt(host);
  if (!nextAt) return true;
  return nextAt.getTime() <= Date.now();
}

export async function bumpHostThrottle(host: string, opts?: { error?: boolean }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const delay = opts?.error ? ERROR_HOST_BACKOFF_MS : DEFAULT_HOST_THROTTLE_MS;
  const nextAt = new Date(Date.now() + delay);
  await db
    .insert(prospectHostThrottle)
    .values({
      host,
      nextAllowedAt: nextAt,
      consecutiveErrors: opts?.error ? 1 : 0,
    })
    .onDuplicateKeyUpdate({
      set: {
        nextAllowedAt: nextAt,
        consecutiveErrors: opts?.error
          ? sql`${prospectHostThrottle.consecutiveErrors} + 1`
          : 0,
      },
    });
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./i, "");
  } catch {
    return null;
  }
}
