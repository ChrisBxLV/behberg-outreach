import crypto from "node:crypto";

export type MailboxOAuthProvider = "google" | "microsoft";

type PendingState = {
  organizationId: number;
  userId: number;
  provider: MailboxOAuthProvider;
  createdAt: number;
};

type ExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
};

const pendingStates = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function getProviderConfig(provider: MailboxOAuthProvider) {
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (provider === "google") {
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: process.env.GOOGLE_MAIL_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_MAIL_CLIENT_SECRET ?? "",
      redirectUri: `${appBaseUrl}/api/mailboxes/oauth/google/callback`,
      scopes: [
        "https://mail.google.com/",
        "openid",
        "email",
        "profile",
      ],
    };
  }
  return {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId: process.env.MS_MAIL_CLIENT_ID ?? "",
    clientSecret: process.env.MS_MAIL_CLIENT_SECRET ?? "",
    redirectUri: `${appBaseUrl}/api/mailboxes/oauth/microsoft/callback`,
    scopes: [
      "offline_access",
      "openid",
      "email",
      "profile",
      "https://outlook.office.com/SMTP.Send",
    ],
  };
}

function prunePendingStates() {
  const now = Date.now();
  for (const [state, payload] of Array.from(pendingStates.entries())) {
    if (now - payload.createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

export function buildMailboxOAuthAuthorizeUrl(input: {
  provider: MailboxOAuthProvider;
  organizationId: number;
  userId: number;
}) {
  prunePendingStates();
  const cfg = getProviderConfig(input.provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(`${input.provider} mailbox OAuth is not configured`);
  }
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, {
    organizationId: input.organizationId,
    userId: input.userId,
    provider: input.provider,
    createdAt: Date.now(),
  });

  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return { state, url: url.toString() };
}

export function consumeMailboxOAuthState(state: string, provider: MailboxOAuthProvider) {
  prunePendingStates();
  const record = pendingStates.get(state);
  if (!record || record.provider !== provider) {
    throw new Error("Invalid or expired OAuth state");
  }
  pendingStates.delete(state);
  return record;
}

export async function exchangeMailboxOAuthCode(input: {
  provider: MailboxOAuthProvider;
  code: string;
}): Promise<ExchangeResult> {
  const cfg = getProviderConfig(input.provider);
  const body = new URLSearchParams();
  body.set("client_id", cfg.clientId);
  body.set("client_secret", cfg.clientSecret);
  body.set("code", input.code);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", cfg.redirectUri);

  const resp = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OAuth token exchange failed: ${txt.slice(0, 500)}`);
  }
  const payload = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!payload.access_token) throw new Error("Provider did not return an access token");
  const expiresAt =
    typeof payload.expires_in === "number"
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    scopes: payload.scope ?? null,
  };
}

export async function getMailboxPrimaryEmail(input: {
  provider: MailboxOAuthProvider;
  accessToken: string;
}): Promise<{ email: string; displayName: string | null; providerAccountId: string | null }> {
  if (input.provider === "google") {
    const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    if (!resp.ok) throw new Error("Failed to read Google profile");
    const data = (await resp.json()) as { email?: string; name?: string; sub?: string };
    if (!data.email) throw new Error("Google profile did not include an email");
    return {
      email: data.email.toLowerCase(),
      displayName: data.name ?? null,
      providerAccountId: data.sub ?? null,
    };
  }

  const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!resp.ok) throw new Error("Failed to read Microsoft profile");
  const data = (await resp.json()) as {
    id?: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  const email = (data.mail ?? data.userPrincipalName ?? "").toLowerCase();
  if (!email) throw new Error("Microsoft profile did not include an email");
  return {
    email,
    displayName: data.displayName ?? null,
    providerAccountId: data.id ?? null,
  };
}

export function getProviderSmtpDefaults(provider: MailboxOAuthProvider) {
  if (provider === "google") {
    return { host: "smtp.gmail.com", port: 587, secure: false };
  }
  return { host: "smtp.office365.com", port: 587, secure: false };
}
