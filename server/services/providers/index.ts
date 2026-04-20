import { decryptSecret } from "../../_core/secrets";
import { getMailboxOauthToken } from "../../db";
import { OauthSmtpProvider } from "./oauthSmtpProvider";
import { SmtpProvider } from "./smtpProvider";
import type { MailProvider } from "./types";

export async function buildProviderForMailbox(mailboxId: number): Promise<MailProvider> {
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

  if (tokenRow.encryptedAccessToken && tokenRow.smtpHost && tokenRow.smtpPort && tokenRow.smtpUsername) {
    const accessToken = decryptSecret(tokenRow.encryptedAccessToken);
    if (!accessToken) throw new Error("OAuth access token missing");
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
