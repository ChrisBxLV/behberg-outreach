import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { encryptSecret } from "../_core/secrets";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createMailbox,
  findMailboxByOrganizationAndEmail,
  getMailboxById,
  getOrganizationById,
  listMailboxesByOrganization,
  removeMailbox,
  setDefaultMailboxForOrganization,
  updateMailbox,
  upsertMailboxHealth,
  upsertMailboxOauthToken,
  upsertMailboxSendLimits,
} from "../db";
import {
  buildMailboxOAuthAuthorizeUrl,
  consumeMailboxOAuthState,
  exchangeMailboxOAuthCode,
  getMailboxPrimaryEmail,
  getProviderSmtpDefaults,
  type MailboxOAuthProvider,
} from "../services/mailboxOAuth";
import { buildProviderForMailbox } from "../services/providers";
import { logMailboxEvent } from "../services/observability";

function assertOrganizationMember(user: {
  role: string | null;
  orgMemberRole: string | null;
  organizationId: number | null;
}) {
  if (!user.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
  }
}

function assertMailboxManager(user: {
  role: string | null;
  orgMemberRole: string | null;
  organizationId: number | null;
}) {
  assertOrganizationMember(user);
  const isPlatformAdmin = user.role === "admin" || user.role === "superadmin";
  const isOrgOwner = user.orgMemberRole === "owner";
  if (!(isPlatformAdmin || isOrgOwner)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only org owners/admins can manage mailboxes." });
  }
}

function canManageMailbox(user: {
  id: number;
  role: string | null;
  orgMemberRole: string | null;
}, mailbox: { connectedByUserId: number | null }) {
  const isPlatformAdmin = user.role === "admin" || user.role === "superadmin";
  const isOrgOwner = user.orgMemberRole === "owner";
  if (isPlatformAdmin || isOrgOwner) return true;
  return mailbox.connectedByUserId != null && mailbox.connectedByUserId === user.id;
}

function defaultSmtpForEmail(email: string): {
  host: string;
  port: number;
  secure: boolean;
  username: string;
} {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1] ?? "";

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { host: "smtp.gmail.com", port: 587, secure: false, username: normalized };
  }
  if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com" ||
    domain.endsWith(".onmicrosoft.com")
  ) {
    return { host: "smtp.office365.com", port: 587, secure: false, username: normalized };
  }

  // Safe fallback for most business Microsoft 365 inboxes.
  return { host: "smtp.office365.com", port: 587, secure: false, username: normalized };
}

function mailboxLimitForPlan(planId: string | null | undefined): number {
  switch ((planId ?? "free").toLowerCase()) {
    case "basic":
      return 1;
    case "business_standard":
      return 3;
    case "pro":
      return 5;
    case "free":
    default:
      return 1;
  }
}

async function assertMailboxLimitAvailable(organizationId: number): Promise<void> {
  const [org, existing] = await Promise.all([
    getOrganizationById(organizationId),
    listMailboxesByOrganization(organizationId),
  ]);
  const limit = mailboxLimitForPlan(org?.subscriptionPlanId);
  if (existing.length >= limit) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        `Mailbox limit reached for your current plan (${existing.length}/${limit}). ` +
        "Please purchase additional licenses in Manage Subscription to connect another mailbox.",
    });
  }
}

export const mailboxesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = dataScopeOrganizationId(ctx.user);
    if (!orgId) return [];
    return listMailboxesByOrganization(orgId);
  }),

  startConnectOAuth: protectedProcedure
    .input(z.object({ provider: z.enum(["google", "microsoft"]) }))
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const orgId = ctx.user.organizationId!;
      const userId = ctx.user.id;
      let result: { authorizeUrl: string; state: string } | { url: string; state: string };
      try {
        result = buildMailboxOAuthAuthorizeUrl({
          provider: input.provider,
          organizationId: orgId,
          userId,
        });
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        if (msg.includes("mailbox OAuth is not configured")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              `${input.provider} mailbox OAuth is not configured. Set APP_BASE_URL, ` +
              `${input.provider === "google" ? "GOOGLE_MAIL_CLIENT_ID/GOOGLE_MAIL_CLIENT_SECRET" : "MS_MAIL_CLIENT_ID/MS_MAIL_CLIENT_SECRET"}, ` +
              "and MAILBOX_TOKEN_ENCRYPTION_KEY (or JWT_SECRET fallback), then restart server.",
          });
        }
        throw err;
      }
      return { authorizeUrl: result.url, state: result.state };
    }),

  completeConnectOAuth: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["google", "microsoft"]),
        code: z.string().min(8),
        state: z.string().min(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const state = consumeMailboxOAuthState(input.state, input.provider as MailboxOAuthProvider);
      if (state.organizationId !== ctx.user.organizationId || state.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "OAuth session does not belong to this user." });
      }

      const exchanged = await exchangeMailboxOAuthCode({
        provider: input.provider as MailboxOAuthProvider,
        code: input.code,
      });
      const profile = await getMailboxPrimaryEmail({
        provider: input.provider as MailboxOAuthProvider,
        accessToken: exchanged.accessToken,
      });

      const existing = await findMailboxByOrganizationAndEmail(
        ctx.user.organizationId!,
        input.provider,
        profile.email,
      );
      if (!existing) {
        await assertMailboxLimitAvailable(ctx.user.organizationId!);
      }
      const smtpDefaults = getProviderSmtpDefaults(input.provider as MailboxOAuthProvider);
      const mailboxId = existing?.id
        ? existing.id
        : await createMailbox({
            organizationId: ctx.user.organizationId!,
            connectedByUserId: ctx.user.id,
            provider: input.provider,
            email: profile.email,
            displayName: profile.displayName,
            status: "connected",
            isDefault: false,
          });

      await updateMailbox(mailboxId, {
        displayName: profile.displayName,
        status: "connected",
      });
      await upsertMailboxOauthToken(mailboxId, {
        encryptedAccessToken: encryptSecret(exchanged.accessToken),
        encryptedRefreshToken: exchanged.refreshToken ? encryptSecret(exchanged.refreshToken) : null,
        accessTokenExpiresAt: exchanged.expiresAt,
        scopes: exchanged.scopes,
        providerAccountId: profile.providerAccountId,
        smtpHost: smtpDefaults.host,
        smtpPort: smtpDefaults.port,
        smtpSecure: smtpDefaults.secure,
        smtpUsername: profile.email,
      });
      await upsertMailboxHealth(mailboxId, {
        reauthRequired: false,
        errorCode: null,
        errorMessage: null,
        lastSuccessAt: new Date(),
      });
      await upsertMailboxSendLimits(mailboxId, {});

      const all = await listMailboxesByOrganization(ctx.user.organizationId!);
      if (!all.some(m => m.isDefault)) {
        await setDefaultMailboxForOrganization(ctx.user.organizationId!, mailboxId);
      }
      logMailboxEvent("mailbox_connected", {
        organizationId: ctx.user.organizationId,
        mailboxId,
        provider: input.provider,
      });
      return { success: true, mailboxId };
    }),

  connectSmtp: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        displayName: z.string().trim().min(1).max(200).optional(),
        host: z.string().trim().min(1).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        secure: z.boolean().optional(),
        username: z.string().trim().min(1).optional(),
        password: z.string().min(1),
        dailyLimit: z.number().int().min(1).max(5000).default(250),
        hourlyLimit: z.number().int().min(1).max(500).default(40),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const normalizedEmail = input.email.trim().toLowerCase();
      const defaults = defaultSmtpForEmail(normalizedEmail);
      const selectedHost = input.host?.trim() || defaults.host;
      const selectedPort = input.port ?? defaults.port;
      const selectedSecure = input.secure ?? defaults.secure;
      const selectedUsername = input.username?.trim() || defaults.username;

      const customOverride =
        selectedHost !== defaults.host ||
        selectedPort !== defaults.port ||
        selectedSecure !== defaults.secure ||
        selectedUsername.toLowerCase() !== defaults.username.toLowerCase();
      if (customOverride) {
        assertMailboxManager(ctx.user);
      }

      const existing = await findMailboxByOrganizationAndEmail(
        ctx.user.organizationId!,
        "smtp",
        normalizedEmail,
      );
      if (!existing) {
        await assertMailboxLimitAvailable(ctx.user.organizationId!);
      }
      const mailboxId = existing?.id
        ? existing.id
        : await createMailbox({
            organizationId: ctx.user.organizationId!,
            connectedByUserId: ctx.user.id,
            provider: "smtp",
            email: normalizedEmail,
            displayName: input.displayName ?? null,
            status: "connected",
            isDefault: false,
          });
      await updateMailbox(mailboxId, {
        email: normalizedEmail,
        displayName: input.displayName ?? null,
        status: "connected",
      });
      await upsertMailboxOauthToken(mailboxId, {
        encryptedSmtpPassword: encryptSecret(input.password),
        smtpHost: selectedHost,
        smtpPort: selectedPort,
        smtpSecure: selectedSecure,
        smtpUsername: selectedUsername,
      });
      await upsertMailboxSendLimits(mailboxId, {
        dailyLimit: input.dailyLimit,
        hourlyLimit: input.hourlyLimit,
      });
      await upsertMailboxHealth(mailboxId, {
        reauthRequired: false,
        errorCode: null,
        errorMessage: null,
        lastSuccessAt: new Date(),
      });
      const all = await listMailboxesByOrganization(ctx.user.organizationId!);
      if (!all.some(m => m.isDefault)) {
        await setDefaultMailboxForOrganization(ctx.user.organizationId!, mailboxId);
      }
      logMailboxEvent("mailbox_connected", {
        organizationId: ctx.user.organizationId,
        mailboxId,
        provider: "smtp",
      });
      return { success: true, mailboxId };
    }),

  disconnect: protectedProcedure
    .input(z.object({ mailboxId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const mailbox = await getMailboxById(input.mailboxId);
      if (!mailbox || mailbox.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mailbox not found" });
      }
      if (!canManageMailbox(ctx.user, mailbox)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only disconnect your own mailbox." });
      }
      await removeMailbox(mailbox.id);
      logMailboxEvent("mailbox_disconnected", {
        organizationId: ctx.user.organizationId,
        mailboxId: mailbox.id,
        provider: mailbox.provider,
      });
      return { success: true };
    }),

  setDefault: protectedProcedure
    .input(z.object({ mailboxId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertMailboxManager(ctx.user);
      const mailbox = await getMailboxById(input.mailboxId);
      if (!mailbox || mailbox.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mailbox not found" });
      }
      await setDefaultMailboxForOrganization(ctx.user.organizationId!, mailbox.id);
      logMailboxEvent("mailbox_default_changed", {
        organizationId: ctx.user.organizationId,
        mailboxId: mailbox.id,
      });
      return { success: true };
    }),

  testSend: protectedProcedure
    .input(z.object({ mailboxId: z.number(), toEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const mailbox = await getMailboxById(input.mailboxId);
      if (!mailbox || mailbox.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mailbox not found" });
      }
      if (!canManageMailbox(ctx.user, mailbox)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only test-send using your own mailbox." });
      }

      try {
        const provider = await buildProviderForMailbox(mailbox.id);
        await provider.verifyConnection();
        await provider.send({
          fromName: mailbox.displayName ?? "Behberg",
          fromEmail: mailbox.email,
          replyTo: mailbox.email,
          toEmail: input.toEmail,
          subject: "Behberg mailbox test",
          text: "Your mailbox is connected and ready for sequencing.",
          html: "<p>Your mailbox is connected and ready for sequencing.</p>",
        });
        await upsertMailboxHealth(mailbox.id, {
          reauthRequired: false,
          errorCode: null,
          errorMessage: null,
          lastSuccessAt: new Date(),
        });
        await updateMailbox(mailbox.id, { status: "connected" });
        logMailboxEvent("mailbox_test_send_ok", {
          organizationId: ctx.user.organizationId,
          mailboxId: mailbox.id,
        });
        return { success: true as const };
      } catch (err: any) {
        await upsertMailboxHealth(mailbox.id, {
          reauthRequired: false,
          errorCode: "test_send_failed",
          errorMessage: err?.message ?? "unknown",
          lastErrorAt: new Date(),
        });
        await updateMailbox(mailbox.id, { status: "error" });
        logMailboxEvent("mailbox_test_send_failed", {
          organizationId: ctx.user.organizationId,
          mailboxId: mailbox.id,
          error: err?.message ?? "unknown",
        });
        return { success: false as const, error: err?.message ?? "Unknown mailbox error" };
      }
    }),
});
