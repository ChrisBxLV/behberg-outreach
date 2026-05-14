/**
 * Runtime health signals: worker heartbeat file + DB connectivity helpers
 * used by GET /api/health. No secrets are written or read.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "./env";

export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
/** Heartbeat older than this is treated as unhealthy (worker process missing or stuck). */
export const WORKER_HEARTBEAT_MAX_AGE_SEC = 90;

const HEARTBEAT_REL = join("data", "runtime", "worker-heartbeat.json");

/** Cleared in production; tests may set a temp file path. */
let heartbeatPathOverride: string | null = null;

/** @internal Used by unit tests only. */
export function _setWorkerHeartbeatPathForTests(p: string | null): void {
  heartbeatPathOverride = p;
}

export function workerHeartbeatFilePath(): string {
  return heartbeatPathOverride ?? join(process.cwd(), HEARTBEAT_REL);
}

export type WorkerHeartbeatFile = {
  lastSeenAt: string;
};

export function writeWorkerHeartbeat(now: Date = new Date()): void {
  const filePath = workerHeartbeatFilePath();
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const body: WorkerHeartbeatFile = { lastSeenAt: now.toISOString() };
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(body)}\n`, "utf8");
  renameSync(tmp, filePath);
}

export function readWorkerHeartbeatFile(): WorkerHeartbeatFile | null {
  try {
    const raw = readFileSync(workerHeartbeatFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const lastSeenAt = (parsed as { lastSeenAt?: unknown }).lastSeenAt;
    if (typeof lastSeenAt !== "string" || !lastSeenAt.trim()) return null;
    const t = Date.parse(lastSeenAt);
    if (!Number.isFinite(t)) return null;
    return { lastSeenAt: new Date(t).toISOString() };
  } catch {
    return null;
  }
}

export type WorkerHealthSlice = {
  ok: boolean;
  lastSeenAt: string | null;
  ageSeconds: number | null;
};

export function evaluateWorkerHeartbeat(nowMs: number = Date.now()): WorkerHealthSlice {
  const row = readWorkerHeartbeatFile();
  if (!row) {
    return { ok: false, lastSeenAt: null, ageSeconds: null };
  }
  const t = Date.parse(row.lastSeenAt);
  if (!Number.isFinite(t)) {
    return { ok: false, lastSeenAt: null, ageSeconds: null };
  }
  const ageSeconds = Math.max(0, Math.floor((nowMs - t) / 1000));
  return {
    ok: ageSeconds < WORKER_HEARTBEAT_MAX_AGE_SEC,
    lastSeenAt: row.lastSeenAt,
    ageSeconds,
  };
}

export type DbHealthSlice = {
  ok: boolean;
  error?: string;
};

/**
 * True when MySQL responds to a trivial query, or when the app is in dev file-auth mode
 * without DATABASE_URL (no MySQL to check).
 */
export async function checkDatabaseReachable(): Promise<DbHealthSlice> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    if (ENV.useDevFileAuth) return { ok: true };
    return { ok: false, error: "not_configured" };
  }
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!db) return { ok: false, error: "unavailable" };
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true };
  } catch {
    return { ok: false, error: "query_failed" };
  }
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Call from the worker process only. Writes immediately, then every 30s. */
export function startWorkerHeartbeatLoop(): void {
  if (heartbeatTimer) return;
  try {
    writeWorkerHeartbeat();
  } catch (err: unknown) {
    console.warn(
      "[WorkerHeartbeat] initial write failed:",
      err instanceof Error ? err.message : err,
    );
  }
  heartbeatTimer = setInterval(() => {
    try {
      writeWorkerHeartbeat();
    } catch (err: unknown) {
      console.warn(
        "[WorkerHeartbeat] tick failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }, WORKER_HEARTBEAT_INTERVAL_MS);
}
