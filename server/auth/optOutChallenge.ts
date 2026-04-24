import { createHash } from "node:crypto";

/**
 * Stable key for login_challenges.email (fits varchar(320)).
 * We key by mailboxId + email so a user can opt-out per-mailbox.
 */
export function optOutChallengeKey(mailboxId: number, email: string): string {
  const normEmail = email.trim().toLowerCase();
  const mid = Number.isFinite(mailboxId) ? mailboxId : 0;
  const h = createHash("sha256")
    .update(`optout|${mid}|${normEmail}`)
    .digest("hex")
    .slice(0, 48);
  return `oo:${h}`;
}

