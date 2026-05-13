import { TRPCError } from "@trpc/server";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import type { User } from "../../drizzle/schema";
import { hasPermission } from "../_core/authz";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { encryptSecret } from "../_core/secrets";
import { inferRequestOrigin } from "../_core/requestOrigin";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createMailbox,
  findMailboxByOrganizationAndEmail,
  getMailboxById,
  getOrganizationById,
  listMailboxesByOrganization,
  formatSuppressionsCsv,
  listSuppressionsForMailbox,
  removeSuppressionById,
  removeMailbox,
  setDefaultMailboxForOrganization,
  updateMailbox,
  upsertMailboxHealth,
  upsertMailboxOauthToken,
  upsertMailboxSendLimits,
} from "../db";
import { sanitizeSignatureHtml } from "../services/signatureSanitize";
import {
  completeMailboxOAuthConnect,
  getMailboxOAuthConnectResult,
  startMailboxOAuthConnect,
} from "../services/mailboxConnectFlow";
import { buildProviderForMailbox } from "../services/providers";
import { logMailboxEvent } from "../services/observability";

function assertOrganizationMember(user: User) {
  if (!user.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
  }
}

function assertMailboxManager(user: User) {
  assertOrganizationMember(user);
  // `system.notifyOwner` ≡ active `admin`/`superadmin` role (workspace or
  // platform). Org owners (per workspace membership) can also manage their
  // own mailboxes.
  const isPlatformAdmin = hasPermission(user, "system.notifyOwner");
  const isOrgOwner = user.orgMemberRole === "owner";
  if (!(isPlatformAdmin || isOrgOwner)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only org owners/admins can manage mailboxes." });
  }
}

function canManageMailbox(
  user: User,
  mailbox: { connectedByUserId: number | null },
) {
  const isPlatformAdmin = hasPermission(user, "system.notifyOwner");
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

type DnsCheckStatus = "pass" | "missing" | "error";

function parseDomainFromEmail(email: string): string | null {
  const domain = String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  return domain.length > 0 ? domain : null;
}

async function resolveTxtRecords(hostname: string): Promise<{ records: string[]; error: string | null }> {
  try {
    const rows = await resolveTxt(hostname);
    return {
      records: rows.map(parts => parts.join("")).filter(Boolean),
      error: null,
    };
  } catch (err: any) {
    return {
      records: [],
      error: String(err?.code ?? err?.message ?? "dns_lookup_failed"),
    };
  }
}

export const mailboxesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = dataScopeOrganizationId(ctx.user);
    if (!orgId) return [];
    return listMailboxesByOrganization(orgId);
  }),

  checkDomainSetup: protectedProcedure
    .input(z.object({ mailboxId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const mailbox = await getMailboxById(input.mailboxId);
      if (!mailbox || mailbox.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mailbox not found" });
      }

      const domain = parseDomainFromEmail(mailbox.email);
      if (!domain) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Mailbox domain could not be resolved." });
      }

      const selectors = ["default", "selector1", "selector2", "google", "k1", "s1"];
      const [spfLookup, dmarcLookup, dkimLookups] = await Promise.all([
        resolveTxtRecords(domain),
        resolveTxtRecords(`_dmarc.${domain}`),
        Promise.all(selectors.map(async selector => ({
          selector,
          lookup: await resolveTxtRecords(`${selector}._domainkey.${domain}`),
        }))),
      ]);

      const spfRecord = spfLookup.records.find(r => /^v=spf1\b/i.test(r)) ?? null;
      const dmarcRecord = dmarcLookup.records.find(r => /^v=dmarc1\b/i.test(r)) ?? null;
      const matchedDkim = dkimLookups.find(entry => entry.lookup.records.some(r => /^v=dkim1\b/i.test(r))) ?? null;

      const spfStatus: DnsCheckStatus = spfRecord ? "pass" : (spfLookup.error ? "error" : "missing");
      const dmarcStatus: DnsCheckStatus = dmarcRecord ? "pass" : (dmarcLookup.error ? "error" : "missing");
      const dkimStatus: DnsCheckStatus = matchedDkim ? "pass" : "missing";
      const checksPassed = [spfStatus, dkimStatus, dmarcStatus].filter(status => status === "pass").length;
      const healthScore = Math.round((checksPassed / 3) * 100);
      const recommendedSpfInclude =
        mailbox.provider === "google"
          ? "include:_spf.google.com"
          : mailbox.provider === "microsoft"
            ? "include:spf.protection.outlook.com"
            : "include:<your-provider-spf-host>";

      return {
        domain,
        mailboxProvider: mailbox.provider,
        checkedAt: new Date().toISOString(),
        healthScore,
        overallStatus: spfStatus === "pass" && dmarcStatus === "pass" && dkimStatus === "pass" ? "healthy" : "attention",
        spf: {
          status: spfStatus,
          record: spfRecord,
          records: spfLookup.records,
          error: spfLookup.error,
        },
        dmarc: {
          status: dmarcStatus,
          record: dmarcRecord,
          records: dmarcLookup.records,
          error: dmarcLookup.error,
        },
        dkim: {
          status: dkimStatus,
          selector: matchedDkim?.selector ?? null,
          checkedSelectors: selectors,
        },
        setupGuidance: {
          spf: {
            host: "@",
            type: "TXT",
            valueExample: `v=spf1 ${recommendedSpfInclude} ~all`,
          },
          dmarc: {
            host: "_dmarc",
            type: "TXT",
            valueExample: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}`,
          },
          dkim: {
            notes:
              mailbox.provider === "google"
                ? "Generate DKIM key in Google Admin > Apps > Google Workspace > Gmail > Authenticate email."
                : mailbox.provider === "microsoft"
                  ? "Enable DKIM for your domain in Microsoft Defender/Exchange admin and publish the CNAME/TXT records provided."
                  : "Enable DKIM in your mailbox provider and publish the selector records they provide.",
            examples: [
              { host: "selector1._domainkey", type: "TXT", valueExample: "v=DKIM1; k=rsa; p=<public-key>" },
              { host: "selector2._domainkey", type: "TXT", valueExample: "v=DKIM1; k=rsa; p=<public-key>" },
            ],
          },
        },
      };
    }),

  startConnectOAuth: protectedProcedure
    .input(z.object({ provider: z.enum(["google", "microsoft"]) }))
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      return startMailboxOAuthConnect({
        provider: input.provider,
        organizationId: ctx.user.organizationId!,
        userId: ctx.user.id,
        appBaseUrl: inferRequestOrigin({
          protocol: ctx.req.protocol,
          headers: ctx.req.headers as any,
        }) || undefined,
      });
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
      const result = await completeMailboxOAuthConnect({
        provider: input.provider,
        code: input.code,
        state: input.state,
        appBaseUrl: inferRequestOrigin({
          protocol: ctx.req.protocol,
          headers: ctx.req.headers as any,
        }) || undefined,
      });
      if (!result.ok) {
        throw new TRPCError({
          code:
            result.reason === "mailbox_limit_reached" ? "PRECONDITION_FAILED" :
            result.reason === "invalid_or_expired_state" ? "BAD_REQUEST" :
            "PRECONDITION_FAILED",
          message: result.message,
        });
      }
      return { success: true, mailboxId: result.mailboxId, attemptId: result.attemptId };
    }),

  getConnectResult: protectedProcedure
    .input(z.object({ attemptId: z.string().min(8) }))
    .query(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      return getMailboxOAuthConnectResult({
        attemptId: input.attemptId,
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
      });
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
        const message = String(err?.message ?? "unknown");
        const reauthRequired = message.toLowerCase().includes("reauth_required") || message.toLowerCase().includes("invalid_grant");
        await upsertMailboxHealth(mailbox.id, {
          reauthRequired,
          errorCode: reauthRequired ? "reauth_required" : "test_send_failed",
          errorMessage: message,
          lastErrorAt: new Date(),
        });
        await updateMailbox(mailbox.id, { status: reauthRequired ? "reauth_required" : "error" });
        logMailboxEvent("mailbox_test_send_failed", {
          organizationId: ctx.user.organizationId,
          mailboxId: mailbox.id,
          error: message,
        });
        return { success: false as const, error: message || "Unknown mailbox error" };
      }
    }),

  updateSignature: protectedProcedure
    .input(
      z.object({
        mailboxId: z.number(),
        signatureHtml: z.string().max(24_000).nullable().optional(),
        signatureLogoUrl: z
          .string()
          .url()
          .max(512)
          .nullable()
          .optional()
          .or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      const mailbox = await getMailboxById(input.mailboxId);
      if (!mailbox || mailbox.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mailbox not found" });
      }
      if (!canManageMailbox(ctx.user, mailbox)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own mailbox signature." });
      }
      const nextHtml =
        input.signatureHtml === undefined
          ? undefined
          : (input.signatureHtml != null ? sanitizeSignatureHtml(input.signatureHtml) : null);
      await updateMailbox(mailbox.id, {
        signatureHtml: nextHtml,
        signatureLogoUrl:
          input.signatureLogoUrl === undefined
            ? undefined
            : input.signatureLogoUrl === "" || !input.signatureLogoUrl
              ? null
              : input.signatureLogoUrl,
      });
      return { success: true as const };
    }),

  listSuppressions: protectedProcedure
    .input(z.object({ mailboxId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      if (!ctx.user.organizationId) {
        return [];
      }
      return listSuppressionsForMailbox(input.mailboxId, ctx.user.organizationId);
    }),

  removeSuppression: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required" });
      }
      const ok = await removeSuppressionById(input.id, ctx.user.organizationId);
      if (!ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Suppression not found" });
      }
      return { success: true as const };
    }),

  exportSuppressionsCsv: protectedProcedure
    .input(z.object({ mailboxId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertOrganizationMember(ctx.user);
      if (!ctx.user.organizationId) {
        return "";
      }
      const rows = await listSuppressionsForMailbox(input.mailboxId, ctx.user.organizationId);
      return formatSuppressionsCsv(
        rows.map(r => ({ recipientEmail: r.recipientEmail, source: r.source, createdAt: r.createdAt })),
      );
    }),
});
