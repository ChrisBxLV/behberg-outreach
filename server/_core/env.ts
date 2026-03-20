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
  defaultAdminLogin: process.env.DEFAULT_ADMIN_LOGIN ?? "behberg",
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD ?? "grebheb",
  /** When true, password sign-in sends a 6-digit email code before issuing a session. Default: off. */
  authRequireEmailOtp: process.env.AUTH_REQUIRE_EMAIL_OTP === "true",
  /** Where to send OTP when login id is not an email (e.g. username `behberg`). Defaults to SMTP_USER. */
  otpDeliveryEmail: process.env.OTP_DELIVERY_EMAIL ?? process.env.SMTP_USER ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
