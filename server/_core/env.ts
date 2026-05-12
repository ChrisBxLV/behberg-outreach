const isProduction = process.env.NODE_ENV === "production";

export function assertRequiredProductionEnv() {
  if (!isProduction) return;

  const missing = [
    !process.env.JWT_SECRET?.trim() ? "JWT_SECRET" : null,
    !process.env.DEFAULT_ADMIN_PASSWORD?.trim() ? "DEFAULT_ADMIN_PASSWORD" : null,
    !process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim() ? "MAILBOX_TOKEN_ENCRYPTION_KEY" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `[Startup] Missing required production environment variable(s): ${missing.join(", ")}.`,
    );
  }
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** When true, auth user/challenge persistence uses .data/local-auth.json (dev only, no MySQL). */
  useDevFileAuth:
    process.env.NODE_ENV === "development" && !(process.env.DATABASE_URL && process.env.DATABASE_URL.trim()),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  /** Comma-separated allowed login ids (stored in users.email). Alias: ADMIN_ALLOWLIST_EMAILS. */
  adminAllowlist: process.env.ADMIN_ALLOWLIST ?? process.env.ADMIN_ALLOWLIST_EMAILS ?? "",
  /** Empty / whitespace falls back so `.env` cannot accidentally disable the default operator id. */
  defaultAdminLogin: (process.env.DEFAULT_ADMIN_LOGIN ?? "behberg").trim().toLowerCase() || "behberg",
  defaultAdminPassword: isProduction
    ? (process.env.DEFAULT_ADMIN_PASSWORD ?? "")
    : (process.env.DEFAULT_ADMIN_PASSWORD ?? "grebheb"),
  /** When true, password sign-in sends a 6-digit email code before issuing a session. Default: off. */
  authRequireEmailOtp: process.env.AUTH_REQUIRE_EMAIL_OTP === "true",
  /** Where to send OTP when login id is not an email (e.g. username `behberg`). Defaults to SMTP_USER. */
  otpDeliveryEmail: process.env.OTP_DELIVERY_EMAIL ?? process.env.SMTP_USER ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** Public base URL for webhooks, tracking pixels, and signature image URLs. */
  appBaseUrl: process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "",
  /**
   * Secret echoed in Microsoft Graph `clientState` and validated on each notification.
   * If unset, clientState validation is skipped (not recommended in production).
   */
  microsoftWebhookClientState: process.env.MICROSOFT_WEBHOOK_CLIENT_STATE?.trim() ?? "",
  /**
   * When set, only these recipient emails will trigger SES bounce log updates (safety in dev).
   * Comma-separated. Empty = any.
   */
  sesBounceAllowlist: (process.env.SES_BOUNCE_TEST_ALLOWLIST ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
  /** Data directory for uploaded signature images (default: `data/signature-assets` under cwd). */
  signatureAssetsDir: process.env.SIGNATURE_ASSETS_DIR?.trim() || "",
};
