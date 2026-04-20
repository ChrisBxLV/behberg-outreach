import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const settingsRouter = router({
  getSmtpConfig: protectedProcedure.query(async () => {
    return {
      host: process.env.SMTP_HOST ?? "smtp.office365.com",
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      user: process.env.SMTP_USER ?? "",
      configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    };
  }),

  getAppConfig: protectedProcedure.query(async () => {
    return {
      appBaseUrl: process.env.APP_BASE_URL ?? "",
      smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    };
  }),

  getMailboxOAuthConfig: protectedProcedure.query(async () => {
    const appBaseUrl = process.env.APP_BASE_URL ?? "";
    return {
      appBaseUrl,
      googleConfigured: Boolean(
        process.env.GOOGLE_MAIL_CLIENT_ID?.trim() && process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim(),
      ),
      microsoftConfigured: Boolean(
        process.env.MS_MAIL_CLIENT_ID?.trim() && process.env.MS_MAIL_CLIENT_SECRET?.trim(),
      ),
      tokenEncryptionConfigured: Boolean(process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim()),
      googleCallbackUrl: `${appBaseUrl || "http://localhost:3000"}/api/mailboxes/oauth/google/callback`,
      microsoftCallbackUrl: `${appBaseUrl || "http://localhost:3000"}/api/mailboxes/oauth/microsoft/callback`,
    };
  }),
});
