import { createHash } from "node:crypto";

/** Stable key for `login_challenges.email` (fits varchar(320) for any login id length). */
export function passwordResetChallengeKey(loginId: string): string {
  const norm = loginId.trim().toLowerCase();
  const h = createHash("sha256").update(`pwreset|${norm}`).digest("hex").slice(0, 48);
  return `pr:${h}`;
}
