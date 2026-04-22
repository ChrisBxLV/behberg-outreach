import crypto from "crypto";

const DEFAULT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function getSecret(): string {
  const s =
    process.env.UNSUBSCRIBE_TOKEN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return "test-unsubscribe-token-secret";
  }
  throw new Error("UNSUBSCRIBE_TOKEN_SECRET or JWT_SECRET must be set for unsubscribe links");
}

export type UnsubscribePayload = {
  mailboxId: number;
  contactId: number;
  email: string;
  exp: number;
};

export function createUnsubscribeToken(payload: Omit<UnsubscribePayload, "exp">, ttlMs = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const data: UnsubscribePayload = { ...payload, exp };
  const body = Buffer.from(JSON.stringify(data), "utf8");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return Buffer.from(JSON.stringify({ d: data, s: sig }), "utf8").toString("base64url");
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { d: UnsubscribePayload; s: string };
    const { d, s } = parsed;
    if (!d || typeof d.mailboxId !== "number" || typeof d.contactId !== "number" || typeof d.email !== "string") {
      return null;
    }
    const body = Buffer.from(JSON.stringify(d), "utf8");
    const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
    const a = Buffer.from(s, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (d.exp < Date.now()) return null;
    return d;
  } catch {
    return null;
  }
}
