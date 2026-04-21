import { resolveAny, resolveMx } from "node:dns/promises";
import { rootDomainOnly } from "./prospectingV1Utils";

export type EmailCheckerStatus = "unknown" | "valid" | "invalid" | "catch_all" | "risky";

export type EmailCheckerResult = {
  email: string;
  status: EmailCheckerStatus;
  confidence: number;
  reason: string;
};

const DISPOSABLE_EMAIL_DOMAINS = new Set(
  [
    "mailinator.com",
    "guerrillamail.com",
    "10minutemail.com",
    "10minutemail.net",
    "tempmail.com",
    "yopmail.com",
    "getnada.com",
    "trashmail.com",
  ].map(d => d.toLowerCase()),
);

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at).trim();
  const domain = email.slice(at + 1).trim();
  if (!local || !domain) return null;
  return { local, domain };
}

function isValidEmailSyntax(email: string): boolean {
  // Keep this conservative; we only need to reject obvious invalid inputs.
  if (email.length < 6 || email.length > 320) return false;
  const parts = splitEmail(email);
  if (!parts) return false;
  if (parts.local.length > 64) return false;
  if (parts.domain.length > 255) return false;
  if (parts.domain.includes("..")) return false;
  if (!/^[a-z0-9._%+-]+$/.test(parts.local)) return false;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(parts.domain)) return false;
  return true;
}

async function hasMxOrARecord(domain: string): Promise<boolean> {
  try {
    const mx = await resolveMx(domain);
    if (mx && mx.length > 0) return true;
  } catch {
    // ignore; fallback to A/AAAA
  }
  try {
    const any = await resolveAny(domain);
    return Array.isArray(any) && any.length > 0;
  } catch {
    return false;
  }
}

export async function verifyEmailLightweight(input: {
  email: string;
  expectedCompanyDomain?: string | null;
  guessConfidence?: number | null;
}): Promise<EmailCheckerResult> {
  const email = normalizeEmail(input.email);
  const guessConfidence = typeof input.guessConfidence === "number" ? input.guessConfidence : null;

  if (!isValidEmailSyntax(email)) {
    return { email, status: "invalid", confidence: 0, reason: "syntax_invalid" };
  }

  const parts = splitEmail(email)!;
  const domain = parts.domain.toLowerCase();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { email, status: "risky", confidence: 0.15, reason: "disposable_domain" };
  }

  const mxOk = await hasMxOrARecord(domain);
  if (!mxOk) {
    return { email, status: "invalid", confidence: 0.05, reason: "domain_no_mx_or_a" };
  }

  const expectedRoot = input.expectedCompanyDomain ? rootDomainOnly(input.expectedCompanyDomain) : null;
  const actualRoot = rootDomainOnly(domain);
  const domainMatches = expectedRoot ? actualRoot === expectedRoot : false;

  // Without an SMTP verification provider, we can’t safely claim “valid”.
  // We treat MX-present emails as risky, with higher confidence when they match the company domain.
  let confidence = 0.55;
  let reason = "mx_present";
  if (domainMatches) {
    confidence += 0.2;
    reason = "mx_present_domain_match";
  }
  if (guessConfidence != null) {
    confidence = Math.min(0.95, Math.max(confidence, Math.min(0.9, guessConfidence)));
    reason = `${reason}_guess_weighted`;
  }

  return {
    email,
    status: "risky",
    confidence,
    reason,
  };
}

export async function verifyTopEmailGuesses(input: {
  guesses: Array<{ email: string; confidence?: number; reason?: string }>;
  expectedCompanyDomain?: string | null;
  maxToCheck?: number;
}): Promise<{ results: EmailCheckerResult[]; best: EmailCheckerResult | null }> {
  const maxToCheck = Math.max(1, Math.min(10, input.maxToCheck ?? 3));
  const toCheck = input.guesses.slice(0, maxToCheck);

  const results: EmailCheckerResult[] = [];
  for (const g of toCheck) {
    // eslint-disable-next-line no-await-in-loop
    const res = await verifyEmailLightweight({
      email: g.email,
      expectedCompanyDomain: input.expectedCompanyDomain,
      guessConfidence: typeof g.confidence === "number" ? g.confidence : null,
    });
    results.push(res);
  }

  const best =
    results
      .slice()
      .sort((a, b) => {
        const rank = (s: EmailCheckerStatus) =>
          s === "valid" ? 4 : s === "catch_all" ? 3 : s === "risky" ? 2 : s === "unknown" ? 1 : 0;
        const dr = rank(b.status) - rank(a.status);
        if (dr !== 0) return dr;
        return b.confidence - a.confidence;
      })[0] ?? null;

  return { results, best };
}

