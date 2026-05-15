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
  getUserById,
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
  resolveGoogleOAuthEnv,
  resolveMicrosoftOAuthEnv,
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

type AttemptStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled";

type FallbackAttempt = {
  attemptId: string;
  state: string;
  provider: MailboxOAuthProvider;
  organizationId: number;
  userId: number;
  status: AttemptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  mailboxId: number | null;
  expiresAt: Date;
  consumedAt: Date | null;
};

const fallbackAttemptsByState = new Map<string, FallbackAttempt>();
const fallbackAttemptsByAttemptId = new Map<string, FallbackAttempt>();

function saveFallbackAttempt(attempt: FallbackAttempt): void {
  fallbackAttemptsByState.set(attempt.state, attempt);
  fallbackAttemptsByAttemptId.set(attempt.attemptId, attempt);
}

function getFallbackAttemptByState(state: string): FallbackAttempt | undefined {
  return fallbackAttemptsByState.get(state);
}

function getFallbackAttemptByAttemptId(attemptId: string): FallbackAttempt | undefined {
  return fallbackAttemptsByAttemptId.get(attemptId);
}

function patchFallbackAttempt(
  attemptId: string,
  patch: Partial<
    Pick<FallbackAttempt, "status" | "errorCode" | "errorMessage" | "mailboxId" | "consumedAt">
  >,
): void {
  const existing = fallbackAttemptsByAttemptId.get(attemptId);
  if (!existing) return;
  const next: FallbackAttempt = {
    ...existing,
    ...patch,
  };
  saveFallbackAttempt(next);
}

async function safeGetAttemptByState(state: string) {
  try {
    return await getMailboxOauthConnectAttemptByState(state);
  } catch (error: any) {
    logMailboxMetric("mailbox_oauth_complete_total", 1, {
      provider: "unknown",
      result: "attempt_lookup_failed",
    });
    logMailboxEvent("mailbox_oauth_complete", {
      result: "attempt_lookup_failed",
      error: String(error?.message ?? "unknown"),
    });
    return undefined;
  }
}

async function safeGetAttemptByAttemptId(attemptId: string) {
  try {
    return await getMailboxOauthConnectAttemptByAttemptId(attemptId);
  } catch (error: any) {
    logMailboxMetric("mailbox_oauth_complete_total", 1, {
      provider: "unknown",
      result: "attempt_lookup_failed",
    });
    logMailboxEvent("mailbox_oauth_complete", {
      result: "attempt_lookup_failed",
      attemptId,
      error: String(error?.message ?? "unknown"),
    });
    return undefined;
  }
}

async function safeUpdateAttempt(
  attemptId: string,
  data: Partial<{
    status: AttemptStatus;
    errorCode: string | null;
    errorMessage: string | null;
    mailboxId: number | null;
    consumedAt: Date | null;
  }>,
): Promise<void> {
  try {
    await updateMailboxOauthConnectAttempt(attemptId, data);
  } catch (error: any) {
    logMailboxEvent("mailbox_oauth_complete", {
      result: "attempt_update_failed",
      attemptId,
      error: String(error?.message ?? "unknown"),
    });
  }
}

export function tokenEncryptionConfigured(): boolean {
  return Boolean(
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.MAILBOXTOKENENCRYPTIONKEY?.trim() ||
    process.env.JWT_SECRET?.trim(),
  );
}

function providerConfigured(provider: MailboxOAuthProvider): boolean {
  if (provider === "google") {
    const cfg = resolveGoogleOAuthEnv();
    return Boolean(cfg.clientId && cfg.clientSecret);
  }
  const cfg = resolveMicrosoftOAuthEnv();
  return Boolean(cfg.clientId && cfg.clientSecret);
}

function mailboxLimitForPlan(planId: string | null | undefined): number {
  switch ((planId ?? "free").toLowerCase()) {
    case "pro_teams":
      return 10;
    case "growth":
    case "business_standard":
      return 3;
    case "scale":
    case "pro":
      return 5;
    case "starter":
    case "basic":
      return 1;
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
  const [org, user] = await Promise.all([
    getOrganizationById(input.organizationId),
    getUserById(input.userId),
  ]);
  if (!org || !user || user.organizationId !== input.organizationId) {
    logMailboxMetric("mailbox_oauth_start_connect_total", 1, {
      provider: input.provider,
      result: "invalid_org_context",
    });
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Organization context is invalid for this account. Sign out and sign in again, then retry.",
    });
  }

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
  let usingFallbackAttemptStore = false;
  try {
    await createMailboxOauthConnectAttempt({
      attemptId,
      state,
      provider: input.provider,
      organizationId: input.organizationId,
      userId: input.userId,
      status: "pending",
      expiresAt: authorize.expiresAt,
    });
  } catch (error: any) {
    usingFallbackAttemptStore = true;
    saveFallbackAttempt({
      attemptId,
      state,
      provider: input.provider,
      organizationId: input.organizationId,
      userId: input.userId,
      status: "pending",
      errorCode: null,
      errorMessage: null,
      mailboxId: null,
      expiresAt: authorize.expiresAt,
      consumedAt: null,
    });
    logMailboxMetric("mailbox_oauth_start_connect_total", 1, {
      provider: input.provider,
      result: "db_insert_failed_fallback",
    });
    logMailboxEvent("mailbox_oauth_start", {
      provider: input.provider,
      organizationId: input.organizationId,
      userId: input.userId,
      attemptId,
      store: "fallback",
      dbError: String(error?.message ?? error?.sqlMessage ?? "unknown"),
    });
  }
  logMailboxMetric("mailbox_oauth_start_connect_total", 1, {
    provider: input.provider,
    result: usingFallbackAttemptStore ? "ok_fallback" : "ok",
  });
  logMailboxEvent("mailbox_oauth_start", {
    provider: input.provider,
    organizationId: input.organizationId,
    userId: input.userId,
    attemptId,
    store: usingFallbackAttemptStore ? "fallback" : "db",
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
  const dbAttempt = await safeGetAttemptByState(input.state);
  const fallbackAttempt = dbAttempt ? undefined : getFallbackAttemptByState(input.state);
  const attempt = dbAttempt ?? fallbackAttempt;
  const usingFallbackAttemptStore = Boolean(!dbAttempt && fallbackAttempt);
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
    if (usingFallbackAttemptStore) {
      patchFallbackAttempt(attempt.attemptId, {
        status: "failed",
        errorCode: "invalid_or_expired_state",
        errorMessage: "OAuth session expired before completion.",
        consumedAt: now,
      });
    } else {
      await safeUpdateAttempt(attempt.attemptId, {
        status: "failed",
        errorCode: "invalid_or_expired_state",
        errorMessage: "OAuth session expired before completion.",
        consumedAt: now,
      });
    }
    return {
      ok: false as const,
      reason: "invalid_or_expired_state" as MailboxOAuthFailureReason,
      message: "OAuth session expired. Please try Connect again.",
      attemptId: attempt.attemptId,
    };
  }

  if (input.providerError) {
    if (usingFallbackAttemptStore) {
      patchFallbackAttempt(attempt.attemptId, {
        status: "cancelled",
        errorCode: "provider_denied",
        errorMessage: `Provider denied consent: ${input.providerError}`,
        consumedAt: now,
      });
    } else {
      await safeUpdateAttempt(attempt.attemptId, {
        status: "cancelled",
        errorCode: "provider_denied",
        errorMessage: `Provider denied consent: ${input.providerError}`,
        consumedAt: now,
      });
    }
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
    if (usingFallbackAttemptStore) {
      patchFallbackAttempt(attempt.attemptId, {
        status: "failed",
        errorCode: "invalid_or_expired_state",
        errorMessage: "OAuth callback did not include an authorization code.",
        consumedAt: now,
      });
    } else {
      await safeUpdateAttempt(attempt.attemptId, {
        status: "failed",
        errorCode: "invalid_or_expired_state",
        errorMessage: "OAuth callback did not include an authorization code.",
        consumedAt: now,
      });
    }
    return {
      ok: false as const,
      reason: "invalid_or_expired_state" as MailboxOAuthFailureReason,
      message: "OAuth callback was incomplete. Please try Connect again.",
      attemptId: attempt.attemptId,
    };
  }

  if (usingFallbackAttemptStore) {
    patchFallbackAttempt(attempt.attemptId, {
      status: "processing",
      consumedAt: now,
      errorCode: null,
      errorMessage: null,
    });
  } else {
    await safeUpdateAttempt(attempt.attemptId, {
      status: "processing",
      consumedAt: now,
      errorCode: null,
      errorMessage: null,
    });
  }

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
    if (usingFallbackAttemptStore) {
      patchFallbackAttempt(attempt.attemptId, {
        status: "succeeded",
        mailboxId,
        errorCode: null,
        errorMessage: null,
      });
    } else {
      await safeUpdateAttempt(attempt.attemptId, {
        status: "succeeded",
        mailboxId,
        errorCode: null,
        errorMessage: null,
      });
    }
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
    if (input.provider === "microsoft") {
      try {
        const { ensureMicrosoftInboxSubscriptionIfConfigured } = await import("./microsoftGraphSubscription");
        await ensureMicrosoftInboxSubscriptionIfConfigured(mailboxId);
      } catch (e: any) {
        logMailboxEvent("microsoft_graph_subscription_skipped", {
          mailboxId,
          reason: String(e?.message ?? e ?? "unknown"),
        });
      }
    }
    return {
      ok: true as const,
      attemptId: attempt.attemptId,
      mailboxId,
      message: "Mailbox connected successfully.",
    };
  } catch (error) {
    const reason = classifyCompletionError(error);
    const rawErrorMessage = String((error as any)?.message ?? "unknown");
    const message =
      reason === "mailbox_limit_reached"
        ? "Mailbox limit reached. Purchase additional licenses to connect more inboxes."
        : reason === "provider_exchange_failed"
          ? rawErrorMessage
          : reason === "provider_profile_failed"
            ? rawErrorMessage
            : "Mailbox connection failed. Please try again.";
    if (usingFallbackAttemptStore) {
      patchFallbackAttempt(attempt.attemptId, {
        status: "failed",
        errorCode: reason,
        errorMessage: rawErrorMessage,
      });
    } else {
      await safeUpdateAttempt(attempt.attemptId, {
        status: "failed",
        errorCode: reason,
        errorMessage: rawErrorMessage,
      });
    }
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
  const attempt =
    (await safeGetAttemptByAttemptId(input.attemptId)) ??
    getFallbackAttemptByAttemptId(input.attemptId);
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
