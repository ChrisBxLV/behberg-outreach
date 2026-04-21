export type MailboxOAuthProvider = "google" | "microsoft";

type ExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
};

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

const STATE_TTL_MS = 10 * 60 * 1000;

function firstEnv(...keys: string[]): { value: string; source: string | null } {
  for (const key of keys) {
    const raw = process.env[key];
    const value = raw?.trim() ?? "";
    if (value) return { value, source: key };
  }
  return { value: "", source: null };
}

export function resolveGoogleOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  clientIdSource: string | null;
  clientSecretSource: string | null;
} {
  const clientId = firstEnv(
    "GOOGLE_MAIL_CLIENT_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_CLINT_ID",
    "GOOGLE_MAIL_CLINT_ID",
    "GOOGLECLIENTID",
    "GOOGLECLINTID",
  );
  const clientSecret = firstEnv(
    "GOOGLE_MAIL_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_SECRET",
    "GOOGLECLIENTSECRET",
    "GOOGLESECRET",
  );
  return {
    clientId: clientId.value,
    clientSecret: clientSecret.value,
    clientIdSource: clientId.source,
    clientSecretSource: clientSecret.source,
  };
}

export function resolveMicrosoftOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  clientIdSource: string | null;
  clientSecretSource: string | null;
} {
  const clientId = firstEnv(
    "MS_MAIL_CLIENT_ID",
    "MS_APP_CLIENT_ID",
    "MS_CLIENT_ID",
    "MICROSOFT_CLIENT_ID",
    "MSMAILCLIENTID",
    "MSAPPCLIENTID",
    "MSCLIENTID",
  );
  const clientSecret = firstEnv(
    "MS_MAIL_CLIENT_SECRET",
    "MS_APP_CLIENT_SECRET",
    "MS_CLIENT_SECRET",
    "MS_SECRET",
    "MICROSOFT_CLIENT_SECRET",
    "MSMAILCLIENTSECRET",
    "MSAPPCLIENTSECRET",
    "MSCLIENTSECRET",
    "MSSECRET",
  );
  return {
    clientId: clientId.value,
    clientSecret: clientSecret.value,
    clientIdSource: clientId.source,
    clientSecretSource: clientSecret.source,
  };
}

export function getMailboxOAuthProviderConfig(
  provider: MailboxOAuthProvider,
  options?: { appBaseUrl?: string },
): ProviderConfig {
  const appBaseUrl = options?.appBaseUrl?.trim() || process.env.APP_BASE_URL?.trim() || "";
  if (!appBaseUrl) {
    throw new Error("mailbox OAuth APP_BASE_URL is not configured");
  }
  if (provider === "google") {
    const google = resolveGoogleOAuthEnv();
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      redirectUri: `${appBaseUrl}/api/mailboxes/oauth/google/callback`,
      scopes: [
        "https://mail.google.com/",
        "openid",
        "email",
        "profile",
      ],
    };
  }
  const microsoft = resolveMicrosoftOAuthEnv();
  return {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId: microsoft.clientId,
    clientSecret: microsoft.clientSecret,
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

export function buildMailboxOAuthAuthorizeUrl(input: {
  provider: MailboxOAuthProvider;
  state: string;
  prompt?: "consent" | "select_account";
  loginHint?: string;
  appBaseUrl?: string;
}) {
  const cfg = getMailboxOAuthProviderConfig(input.provider, {
    appBaseUrl: input.appBaseUrl,
  });
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(`${input.provider} mailbox OAuth is not configured`);
  }

  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  if (input.prompt) {
    url.searchParams.set("prompt", input.prompt);
  }
  if (input.loginHint?.trim()) {
    url.searchParams.set("login_hint", input.loginHint.trim());
  }
  return {
    url: url.toString(),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  };
}

export async function exchangeMailboxOAuthCode(input: {
  provider: MailboxOAuthProvider;
  code: string;
  appBaseUrl?: string;
}): Promise<ExchangeResult> {
  const cfg = getMailboxOAuthProviderConfig(input.provider, {
    appBaseUrl: input.appBaseUrl,
  });
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

export async function refreshMailboxOAuthAccessToken(input: {
  provider: MailboxOAuthProvider;
  refreshToken: string;
}): Promise<ExchangeResult> {
  const cfg = getMailboxOAuthProviderConfig(input.provider, {
    appBaseUrl: process.env.APP_BASE_URL?.trim() || "https://krot.io",
  });
  const body = new URLSearchParams();
  body.set("client_id", cfg.clientId);
  body.set("client_secret", cfg.clientSecret);
  body.set("refresh_token", input.refreshToken);
  body.set("grant_type", "refresh_token");
  body.set("redirect_uri", cfg.redirectUri);

  const resp = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OAuth token refresh failed: ${txt.slice(0, 500)}`);
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
    refreshToken: payload.refresh_token ?? input.refreshToken,
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
