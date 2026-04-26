import { z } from "zod";
import { inferRequestOrigin } from "../_core/requestOrigin";
import { protectedProcedure, router } from "../_core/trpc";
import { getProviderReadinessReasons } from "../services/mailboxConnectFlow";
import { resolveGoogleOAuthEnv, resolveMicrosoftOAuthEnv } from "../services/mailboxOAuth";
import { getUserDashboardPrefs, upsertUserDashboardPrefs } from "../db";

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
    const inferredBaseUrl = inferRequestOrigin({
      protocol: ctx.req.protocol,
      headers: ctx.req.headers as any,
    });
    const appBaseUrl = process.env.APP_BASE_URL?.trim() || inferredBaseUrl;
    const encryptionSecret =
      process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
    const googleReasons = getProviderReadinessReasons("google", appBaseUrl);
    const microsoftReasons = getProviderReadinessReasons("microsoft", appBaseUrl);
    const googleEnv = resolveGoogleOAuthEnv();
    const microsoftEnv = resolveMicrosoftOAuthEnv();
    const hasOrganizationContext = Boolean(ctx.user.organizationId);
    if (!hasOrganizationContext) {
      googleReasons.push("organization_context_required");
      microsoftReasons.push("organization_context_required");
    }
    return {
      appBaseUrl,
      googleConfigured: !googleReasons.includes("missing_provider_config"),
      microsoftConfigured: !microsoftReasons.includes("missing_provider_config"),
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
      credentialSource: {
        googleClientId: googleEnv.clientIdSource,
        googleClientSecret: googleEnv.clientSecretSource,
        microsoftClientId: microsoftEnv.clientIdSource,
        microsoftClientSecret: microsoftEnv.clientSecretSource,
      },
    };
  }),

  getDashboardPrefs: protectedProcedure.query(async ({ ctx }) => {
    const row = await getUserDashboardPrefs(ctx.user.id);
    return row;
  }),

  setDashboardPrefs: protectedProcedure
    .input(z.object({
      rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
      sections: z.record(z.string(), z.boolean()),
      sectionOrder: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserDashboardPrefs({
        userId: ctx.user.id,
        rangeDays: input.rangeDays,
        sections: input.sections,
        sectionOrder: input.sectionOrder,
      });
      return { success: true as const };
    }),
});
