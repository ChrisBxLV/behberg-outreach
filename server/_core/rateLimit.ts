import rateLimit from "express-rate-limit";

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const FIFTEEN_MIN_MS = 15 * ONE_MINUTE_MS;

function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * True under Vitest or when NODE_ENV=test. Used to bypass rate limits in tests
 * so the existing auth/test fixtures don't trip them and to keep the limiter
 * stateless across runs.
 */
export function isRateLimitTestEnv(): boolean {
  return process.env.VITEST !== undefined || process.env.NODE_ENV === "test";
}

/**
 * Centralized, env-overridable rate-limit configuration. See `.env.example`
 * for the exposed knobs (`RATE_LIMIT_*_MAX`, `RATE_LIMIT_*_WINDOW_MS`).
 */
export const rateLimitConfig = {
  authCode: {
    max: readPositiveIntEnv("RATE_LIMIT_AUTH_CODE_MAX", 5),
    windowMs: readPositiveIntEnv("RATE_LIMIT_AUTH_CODE_WINDOW_MS", FIFTEEN_MIN_MS),
  },
  passwordReset: {
    max: readPositiveIntEnv("RATE_LIMIT_PASSWORD_RESET_MAX", 5),
    windowMs: readPositiveIntEnv("RATE_LIMIT_PASSWORD_RESET_WINDOW_MS", FIFTEEN_MIN_MS),
  },
  optOut: {
    max: readPositiveIntEnv("RATE_LIMIT_OPT_OUT_MAX", 10),
    windowMs: readPositiveIntEnv("RATE_LIMIT_OPT_OUT_WINDOW_MS", FIFTEEN_MIN_MS),
  },
  csvImport: {
    max: readPositiveIntEnv("RATE_LIMIT_CSV_IMPORT_MAX", 20),
    windowMs: readPositiveIntEnv("RATE_LIMIT_CSV_IMPORT_WINDOW_MS", ONE_HOUR_MS),
  },
  signatureUpload: {
    max: readPositiveIntEnv("RATE_LIMIT_SIGNATURE_UPLOAD_MAX", 30),
    windowMs: readPositiveIntEnv("RATE_LIMIT_SIGNATURE_UPLOAD_WINDOW_MS", ONE_HOUR_MS),
  },
  oauthCallback: {
    max: readPositiveIntEnv("RATE_LIMIT_OAUTH_CALLBACK_MAX", 30),
    windowMs: readPositiveIntEnv("RATE_LIMIT_OAUTH_CALLBACK_WINDOW_MS", FIFTEEN_MIN_MS),
  },
} as const;

function buildLimiter(opts: { max: number; windowMs: number }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => isRateLimitTestEnv(),
    handler: (_req, res) => {
      const retryAfterSeconds = Math.max(1, Math.ceil(opts.windowMs / 1000));
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds))
        .json({
          error: "rate_limited",
          message: "Too many requests. Please try again later.",
          retryAfterSeconds,
        });
    },
  });
}

export const optOutLimiter = buildLimiter(rateLimitConfig.optOut);
export const csvImportLimiter = buildLimiter(rateLimitConfig.csvImport);
export const signatureUploadLimiter = buildLimiter(rateLimitConfig.signatureUpload);
export const oauthCallbackLimiter = buildLimiter(rateLimitConfig.oauthCallback);
