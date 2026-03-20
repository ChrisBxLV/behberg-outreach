import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Debug logging should be safe by default.
// In production, this function is a no-op (see below).
//
// In development, optional ingest + file logging are configured via env vars
// so we don't hardcode a specific endpoint/session/log filename.
const INGEST_URL = process.env.AGENT_DEBUG_INGEST_URL;
const SESSION_ID = process.env.AGENT_DEBUG_SESSION_ID ?? "";
const LOG_FILENAME = process.env.AGENT_DEBUG_LOG_FILENAME ?? "agent-debug.log";

// This file lives at server/_core/agentDebugLog.ts → repo root is two levels up (stable vs process.cwd()).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG_FILE = join(REPO_ROOT, LOG_FILENAME);

/**
 * Debug-mode logging: POST to ingest (when available) and always append NDJSON to project-root log file.
 */
export function agentDebugLog(entry: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
}) {
  // Never run debug logging in production.
  // This prevents:
  // - hardcoded HTTP ingest calls to local endpoints
  // - writing debug log files into the repo on the deployed host
  if (process.env.NODE_ENV === "production") return;

  const payload = {
    ...(SESSION_ID ? { sessionId: SESSION_ID } : {}),
    ...entry,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);

  if (INGEST_URL) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (SESSION_ID) headers["X-Debug-Session-Id"] = SESSION_ID;

    fetch(INGEST_URL, {
      method: "POST",
      headers,
      body,
    }).catch(() => {});
  }

  try {
    appendFileSync(LOG_FILE, `${body}\n`, "utf8");
  } catch {
    /* ignore disk errors */
  }
  try {
    console.error("[agentDebugLog]", entry.hypothesisId ?? "?", entry.message);
  } catch {
    /* ignore */
  }
}
