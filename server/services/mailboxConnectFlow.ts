import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { encryptSecret } from "../_core/secrets";
import {
  createMailbox,
  createMailboxOauthConnectAttempt,
  findMailboxByOrganizationAndEmail,
  getMailboxOauthConnectAttemptByAttemptId,
  getMailboxOauthConnectAttemptByState,
  getOrganizationById,
  listMailboxesByOrganization,
  setDefaultMailboxForOrganization,
  updateMailbox,
  updateMailboxOauthConnectAttempt,
  upsertMailboxHealth,
  upsertMailboxOauthToken,
  upsertMailboxSendLimits,
} from "../db";
import {
  buildMailboxOAuthAuthorizeUrl,
  exchangeMailboxOAuthCode,
  getMailboxPrimaryEmail,
  getProviderSmtpDefaults,
  type MailboxOAuthProvider,
} from "./mailboxOAuth";
import { logMailboxEvent, logMailboxMetric } from "./observability";

export type MailboxOAuthFailureReason =
  | "missing_app_base_url"
  | "missing_provider_config"
  | "missing_encryption_secret"
  | "invalid_or_expired_state"
  | "provider_denied"
  | "provider_exchange_failed"
  | "provider_profile_failed"
  | "mailbox_limit_reached"
  | "unknown";

export function tokenEncryptionConfigured(): boolean {
  return Boolean(process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim());
}

function providerConfigured(provider: MailboxOAuthProvider): boolean {
  if (provider === "google") {
    const id = process.env.GOOGLE_MAIL_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
    const secret =
      process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_SECRET?.trim();
    return Boolean(id && secret);
  }
  const id =
    process.env.MS_MAIL_CLIENT_ID?.trim() ||
    process.env.MS_APP_CLIENT_ID?.trim() ||
    process.env.MICROSOFT_CLIENT_ID?.trim();
  const secret =
    process.env.MS_MAIL_CLIENT_SECRET?.trim() ||
    process.env.MS_SECRET?.trim() ||
    process.env.MICROSOFT_CLIENT_SECRET?.trim();
  return Boolean(id && secret);
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

export function getProviderReadinessReasons(
  provider: MailboxOAuthProvider,
  appBaseUrlOverride?: string,
): string[] {
  const reasons: string[] = [];
  if (!(appBaseUrlOverride?.trim() || process.env.APP_BASE_URL?.trim())) {
    reasons.push("missing_app_base_url");
  }
  if (!providerConfigured(provider)) reasons.push("missing_provider_config");
  if (!tokenEncryptionConfigured()) reasons.push("missing_encryption_secret");
  return reasons;
}

export async function startMailboxOAuthConnect(input: {
  provider: MailboxOAuthProvider;
  organizationId: number;
  userId: number;
  appBaseUrl?: string;
}) {
  const reasons = getProviderReadinessReasons(input.provider, input.appBaseUrl);
  if (reasons.length > 0) {
    logMailboxMetric("mailbox_oauth_start_connect_total", 1, {
      provider: input.provider,
      result: reasons[0] ?? "misconfigured",
    });
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: reasons[0] === "missing_app_base_url"
        ? "Mailbox OAuth is not configured: APP_BASE_URL is missing."
        : reasons[0] === "missing_provider_config"
          ? `${input.provider} mailbox OAuth client credentials are missing.`
          : "Mailbox OAuth token encryption is not configured.",
    });
  }

  const state = crypto.randomBytes(20).toString("hex");
  const attemptId = crypto.randomBytes(12).toString("hex");
  const authorize = buildMailboxOAuthAuthorizeUrl({
    provider: input.provider,
    state,
    prompt: "consent",
    appBaseUrl: input.appBaseUrl,
  });
  await createMailboxOauthConnectAttempt({
    attemptId,
    state,
    provider: input.provider,
    organizationId: input.organizationId,
    userId: input.userId,
    status: "pending",
    expiresAt: authorize.expiresAt,
  });
  logMailboxMetric("mailbox_oauth_start_connect_total", 1, {
    provider: input.provider,
    result: "ok",
  });
  logMailboxEvent("mailbox_oauth_start", {
    provider: input.provider,
    organizationId: input.organizationId,
    userId: input.userId,
    attemptId,
  });
  return {
    attemptId,
    state,
    authorizeUrl: authorize.url,
    expiresAt: authorize.expiresAt,
  };
}

function classifyCompletionError(error: unknown): MailboxOAuthFailureReason {
  const message = String((error as any)?.message ?? "").toLowerCase();
  if (message.includes("oauth token exchange failed")) return "provider_exchange_failed";
  if (message.includes("google profile") || message.includes("microsoft profile")) return "provider_profile_failed";
  if (message.includes("mailbox limit reached")) return "mailbox_limit_reached";
  return "unknown";
}

export async function completeMailboxOAuthConnect(input: {
  provider: MailboxOAuthProvider;
  code?: string;
  state: string;
  providerError?: string;
  appBaseUrl?: string;
}) {
  const attempt = await getMailboxOauthConnectAttemptByState(input.state);
  if (!attempt || attempt.provider !== input.provider) {
    return {
      ok: false as const,
      reason: "invalid_or_expired_state" as MailboxOAuthFailureReason,
      message: "OAuth session is invalid or expired. Please try Connect again.",
      attemptId: null,
    };
  }
  const now = new Date();
  if (attempt.expiresAt <= now || attempt.status !== "pending") {
    await updateMailboxOauthConnectAttempt(attempt.attemptId, {
      status: "failed",
      errorCode: "invalid_or_expired_state",
      errorMessage: "OAuth session expired before completion.",
      consumedAt: now,
    });
    return {
      ok: false as const,
      reason: "invalid_or_expired_state" as MailboxOAuthFailureReason,
      message: "OAuth session expired. Please try Connect again.",
      attemptId: attempt.attemptId,
    };
  }

  if (input.providerError) {
    await updateMailboxOauthConnectAttempt(attempt.attemptId, {
      status: "cancelled",
      errorCode: "provider_denied",
      errorMessage: `Provider denied consent: ${input.providerError}`,
      consumedAt: now,
    });
    logMailboxMetric("mailbox_oauth_complete_total", 1, {
      provider: input.provider,
      result: "provider_denied",
    });
    return {
      ok: false as const,
      reason: "provider_denied" as MailboxOAuthFailureReason,
      message: "Mailbox permission was denied. Please retry and approve access.",
      attemptId: attempt.attemptId,
    };
  }

  if (!input.code?.trim()) {
    await updateMailboxOauthConnectAttempt(attempt.attemptId, {
      status: "failed",
      errorCode: "invalid_or_expired_state",
      errorMessage: "OAuth callback did not include an authorization code.",
      consumedAt: now,
    });
    return {
      ok: false as const,
      reason: "invalid_or_expired_state" as MailboxOAuthFailureReason,
      message: "OAuth callback was incomplete. Please try Connect again.",
      attemptId: attempt.attemptId,
    };
  }

  await updateMailboxOauthConnectAttempt(attempt.attemptId, {
    status: "processing",
    consumedAt: now,
    errorCode: null,
    errorMessage: null,
  });

  try {
    const exchanged = await exchangeMailboxOAuthCode({
      provider: input.provider,
      code: input.code,
      appBaseUrl: input.appBaseUrl,
    });
    const profile = await getMailboxPrimaryEmail({
      provider: input.provider,
      accessToken: exchanged.accessToken,
    });

    const existing = await findMailboxByOrganizationAndEmail(
      attempt.organizationId,
      input.provider,
      profile.email,
    );
    if (!existing) {
      await assertMailboxLimitAvailable(attempt.organizationId);
    }
    const smtpDefaults = getProviderSmtpDefaults(input.provider);
    const mailboxId = existing?.id
      ? existing.id
      : await createMailbox({
          organizationId: attempt.organizationId,
          connectedByUserId: attempt.userId,
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
    const all = await listMailboxesByOrganization(attempt.organizationId);
    if (!all.some(m => m.isDefault)) {
      await setDefaultMailboxForOrganization(attempt.organizationId, mailboxId);
    }
    await updateMailboxOauthConnectAttempt(attempt.attemptId, {
      status: "succeeded",
      mailboxId,
      errorCode: null,
      errorMessage: null,
    });
    logMailboxEvent("mailbox_connected", {
      organizationId: attempt.organizationId,
      mailboxId,
      provider: input.provider,
    });
    logMailboxEvent("mailbox_oauth_complete", {
      provider: input.provider,
      organizationId: attempt.organizationId,
      userId: attempt.userId,
      attemptId: attempt.attemptId,
      result: "ok",
    });
    logMailboxMetric("mailbox_oauth_complete_total", 1, {
      provider: input.provider,
      result: "ok",
    });
    return {
      ok: true as const,
      attemptId: attempt.attemptId,
      mailboxId,
      message: "Mailbox connected successfully.",
    };
  } catch (error) {
    const reason = classifyCompletionError(error);
    const message =
      reason === "mailbox_limit_reached"
        ? "Mailbox limit reached. Purchase additional licenses to connect more inboxes."
        : reason === "provider_exchange_failed"
          ? "Could not complete provider token exchange. Please retry connect."
          : reason === "provider_profile_failed"
            ? "Connected account did not return a valid mailbox profile."
            : "Mailbox connection failed. Please try again.";
    await updateMailboxOauthConnectAttempt(attempt.attemptId, {
      status: "failed",
      errorCode: reason,
      errorMessage: String((error as any)?.message ?? "unknown"),
    });
    logMailboxMetric("mailbox_oauth_complete_total", 1, {
      provider: input.provider,
      result: reason,
    });
    logMailboxEvent("mailbox_oauth_complete", {
      provider: input.provider,
      organizationId: attempt.organizationId,
      userId: attempt.userId,
      attemptId: attempt.attemptId,
      result: reason,
    });
    return {
      ok: false as const,
      attemptId: attempt.attemptId,
      reason,
      message,
    };
  }
}

export async function getMailboxOAuthConnectResult(input: {
  attemptId: string;
  organizationId: number | null;
  userId: number;
}) {
  const attempt = await getMailboxOauthConnectAttemptByAttemptId(input.attemptId);
  if (!attempt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "OAuth connect attempt not found." });
  }
  if (attempt.userId !== input.userId || attempt.organizationId !== input.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "OAuth connect attempt does not belong to this user." });
  }
  return {
    attemptId: attempt.attemptId,
    provider: attempt.provider,
    status: attempt.status,
    reason: attempt.errorCode,
    message: attempt.errorMessage,
    mailboxId: attempt.mailboxId,
    expiresAt: attempt.expiresAt,
    consumedAt: attempt.consumedAt,
  };
}
