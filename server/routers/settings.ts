import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getProviderReadinessReasons } from "../services/mailboxConnectFlow";

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

  getMailboxOAuthConfig: protectedProcedure.query(async ({ ctx }) => {
    const appBaseUrl = process.env.APP_BASE_URL ?? "";
    const encryptionSecret =
      process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
    const googleReasons = getProviderReadinessReasons("google");
    const microsoftReasons = getProviderReadinessReasons("microsoft");
    const hasOrganizationContext = Boolean(ctx.user.organizationId);
    if (!hasOrganizationContext) {
      googleReasons.push("organization_context_required");
      microsoftReasons.push("organization_context_required");
    }
    return {
      appBaseUrl,
      googleConfigured: Boolean(
        process.env.GOOGLE_MAIL_CLIENT_ID?.trim() && process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim(),
      ),
      microsoftConfigured: Boolean(
        process.env.MS_MAIL_CLIENT_ID?.trim() && process.env.MS_MAIL_CLIENT_SECRET?.trim(),
      ),
      tokenEncryptionConfigured: Boolean(encryptionSecret),
      hasOrganizationContext,
      googleCallbackUrl: appBaseUrl
        ? `${appBaseUrl}/api/mailboxes/oauth/google/callback`
        : "",
      microsoftCallbackUrl: appBaseUrl
        ? `${appBaseUrl}/api/mailboxes/oauth/microsoft/callback`
        : "",
      readinessReasons: {
        google: googleReasons,
        microsoft: microsoftReasons,
      },
    };
  }),
});
