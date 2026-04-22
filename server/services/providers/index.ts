import { decryptSecret, encryptSecret } from "../../_core/secrets";
import { getMailboxById, getMailboxOauthToken, upsertMailboxOauthToken } from "../../db";
import { refreshMailboxOAuthAccessToken } from "../mailboxOAuth";
import { MicrosoftGraphProvider } from "./microsoftGraphProvider";
import { OauthSmtpProvider } from "./oauthSmtpProvider";
import { SmtpProvider } from "./smtpProvider";
import type { MailProvider } from "./types";

function tokenLikelyExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const refreshBufferMs = 2 * 60 * 1000;
  return expiresAt.getTime() <= Date.now() + refreshBufferMs;
}

export async function buildProviderForMailbox(mailboxId: number): Promise<MailProvider> {
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox) throw new Error("Mailbox not found");
  const tokenRow = await getMailboxOauthToken(mailboxId);
  if (!tokenRow) throw new Error("Mailbox credentials not found");

  if (tokenRow.encryptedSmtpPassword && tokenRow.smtpHost && tokenRow.smtpPort && tokenRow.smtpUsername) {
    const password = decryptSecret(tokenRow.encryptedSmtpPassword);
    if (!password) throw new Error("SMTP password missing");
    return new SmtpProvider({
      host: tokenRow.smtpHost,
      port: tokenRow.smtpPort,
      secure: tokenRow.smtpSecure ?? false,
      username: tokenRow.smtpUsername,
      password,
    });
  }

  if (tokenRow.encryptedAccessToken) {
    let accessToken = decryptSecret(tokenRow.encryptedAccessToken);
    if (!accessToken) throw new Error("OAuth access token missing");
    const refreshToken = decryptSecret(tokenRow.encryptedRefreshToken ?? null);
    if (refreshToken && tokenLikelyExpired(tokenRow.accessTokenExpiresAt ?? null)) {
      try {
        const refreshed = await refreshMailboxOAuthAccessToken({
          provider: mailbox.provider as "google" | "microsoft",
          refreshToken,
        });
        accessToken = refreshed.accessToken;
        await upsertMailboxOauthToken(mailboxId, {
          encryptedAccessToken: encryptSecret(refreshed.accessToken),
          encryptedRefreshToken: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null,
          accessTokenExpiresAt: refreshed.expiresAt,
          scopes: refreshed.scopes ?? tokenRow.scopes,
        });
      } catch (error: any) {
        const message = String(error?.message ?? "OAuth refresh failed");
        if (message.toLowerCase().includes("invalid_grant")) {
          throw new Error("reauth_required: OAuth refresh token was rejected by provider");
        }
        throw new Error(`OAuth refresh failed: ${message}`);
      }
    }

    if (mailbox.provider === "microsoft") {
      return new MicrosoftGraphProvider({
        accessToken,
        mailboxEmail: mailbox.email,
      });
    }

    if (!tokenRow.smtpHost || !tokenRow.smtpPort || !tokenRow.smtpUsername) {
      throw new Error("OAuth SMTP settings are missing");
    }
    return new OauthSmtpProvider({
      host: tokenRow.smtpHost,
      port: tokenRow.smtpPort,
      secure: tokenRow.smtpSecure ?? false,
      username: tokenRow.smtpUsername,
      accessToken,
    });
  }

  throw new Error("Mailbox provider credentials are incomplete");
}

/** OAuth access token for Microsoft Graph (webhooks, message fetch) — not for SMTP-only Google. */
export async function getMicrosoftGraphAccessTokenForMailbox(mailboxId: number): Promise<string> {
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox) throw new Error("Mailbox not found");
  if (mailbox.provider !== "microsoft") {
    throw new Error("Mailbox is not a Microsoft 365 / Graph account");
  }
  const tokenRow = await getMailboxOauthToken(mailboxId);
  if (!tokenRow) throw new Error("Mailbox credentials not found");
  if (tokenRow.encryptedSmtpPassword) {
    throw new Error("Mailbox is not connected via Microsoft OAuth (Graph token missing)");
  }
  if (tokenRow.encryptedAccessToken) {
    let accessToken = decryptSecret(tokenRow.encryptedAccessToken);
    if (!accessToken) throw new Error("OAuth access token missing");
    const refreshToken = decryptSecret(tokenRow.encryptedRefreshToken ?? null);
    if (refreshToken && tokenLikelyExpired(tokenRow.accessTokenExpiresAt ?? null)) {
      try {
        const refreshed = await refreshMailboxOAuthAccessToken({
          provider: "microsoft",
          refreshToken,
        });
        accessToken = refreshed.accessToken;
        await upsertMailboxOauthToken(mailboxId, {
          encryptedAccessToken: encryptSecret(refreshed.accessToken),
          encryptedRefreshToken: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null,
          accessTokenExpiresAt: refreshed.expiresAt,
          scopes: refreshed.scopes ?? tokenRow.scopes,
        });
      } catch (error: any) {
        const message = String(error?.message ?? "OAuth refresh failed");
        if (message.toLowerCase().includes("invalid_grant")) {
          throw new Error("reauth_required: OAuth refresh token was rejected by provider");
        }
        throw new Error(`OAuth refresh failed: ${message}`);
      }
    }
    return accessToken;
  }
  throw new Error("Mailbox has no Microsoft OAuth access token");
}
