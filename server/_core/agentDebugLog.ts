import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This file lives at server/_core/agentDebugLog.ts → repo root is two levels up (stable vs process.cwd()).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const INGEST_URL = process.env.AGENT_DEBUG_INGEST_URL;
const SESSION_ID = process.env.AGENT_DEBUG_SESSION_ID ?? "";
const LOG_FILENAME = process.env.AGENT_DEBUG_LOG_FILENAME ?? "agent-debug.log";
const LOG_FILE = join(REPO_ROOT, LOG_FILENAME);

/**
 * Opt-in agent / Cursor debug logging. When false (default), `agentDebugLog` is a no-op:
 * no ingest POST, no log file writes, no stderr noise — including in development.
 *
 * Set `AGENT_DEBUG_LOGS=true` (or `1` / `yes`) only while actively debugging.
 */
export function isAgentDebugEnabled(): boolean {
  const v = (process.env.AGENT_DEBUG_LOGS ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Debug-mode logging: POST to ingest (when configured) and append NDJSON to project-root log file.
 * Gated by {@link isAgentDebugEnabled}; does not replace production `console.error` / `console.warn`.
 */
export function agentDebugLog(entry: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
}) {
  if (!isAgentDebugEnabled()) return;

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
