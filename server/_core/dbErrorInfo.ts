/**
 * Safe, non-sensitive structured summary of a database error for logs.
 *
 * Drizzle wraps the underlying driver error (mysql2) on its own error class
 * with a `cause` property. The useful diagnostic fields (`code`, `errno`,
 * `sqlState`, `sqlMessage`) live on the mysql2 error, while the human-readable
 * "Failed query" prefix lives on the Drizzle wrapper. Walk the chain and pull
 * only the fields that are safe to log — never the SQL, bind parameters, or
 * stack trace, which may contain user-provided data or secrets in adjacent
 * fields the driver may add in the future.
 */

export type DbErrorInfo = {
  name: string;
  code?: string;
  errno?: number;
  sqlState?: string;
  message: string;
};

const MAX_MESSAGE_LENGTH = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(obj: Record<string, unknown> | null, key: string): string | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickNumber(obj: Record<string, unknown> | null, key: string): number | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function truncate(text: string, max: number = MAX_MESSAGE_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function summarizeDbError(err: unknown): DbErrorInfo {
  const wrapper = asRecord(err);
  const cause = asRecord(wrapper?.cause);

  const name = pickString(wrapper, "name") ?? "Error";
  // Driver-level fields (mysql2) live on the wrapped cause; Drizzle's
  // wrapper sometimes mirrors them, so we look at both and prefer the
  // driver cause when present.
  const code = pickString(cause, "code") ?? pickString(wrapper, "code");
  const errno = pickNumber(cause, "errno") ?? pickNumber(wrapper, "errno");
  const sqlState = pickString(cause, "sqlState") ?? pickString(wrapper, "sqlState");

  // Prefer the driver's `sqlMessage` (short, just the MySQL error text) over
  // the Drizzle wrapper's `message` (which is prefixed with "Failed query:
  // <sql>" and can be very long).
  const rawMessage =
    pickString(cause, "sqlMessage") ??
    pickString(wrapper, "sqlMessage") ??
    pickString(wrapper, "message") ??
    pickString(cause, "message") ??
    (typeof err === "string" ? err : "");

  return {
    name,
    ...(code ? { code } : {}),
    ...(errno !== undefined ? { errno } : {}),
    ...(sqlState ? { sqlState } : {}),
    message: truncate(rawMessage || "unknown_db_error"),
  };
}
