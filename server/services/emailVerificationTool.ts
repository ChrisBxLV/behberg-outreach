import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { generateDomainCandidates, rootDomainOnly, splitName } from "./prospectingV1Utils";

type CheckStatus = "pass" | "warn" | "fail";

type VerificationCheck = {
  check: "syntax" | "domain_dns" | "disposable_domain" | "catch_all";
  status: CheckStatus;
  detail: string;
};

export type DnsLookupResult = {
  domain: string;
  hasMx: boolean;
  hasA: boolean;
  hasAaaa: boolean;
  mxRecords: string[];
};

export type DomainResolution = {
  domain: string | null;
  confidence: number;
  source: "domain_hint" | "company_website" | "company_name_probe" | "unresolved";
  evidence: string[];
};

export type EmailCandidate = {
  email: string;
  pattern:
    | "first.last"
    | "firstlast"
    | "flast"
    | "firstl"
    | "f.last"
    | "first.l"
    | "first";
  confidence: number;
};

export type EmailLegitimacy = {
  email: string;
  normalizedEmail: string | null;
  domain: string | null;
  isValidSyntax: boolean;
  isDisposableDomain: boolean;
  hasMx: boolean;
  hasAOrAaaa: boolean;
  catchAll: boolean | null;
  confidence: number;
  verdict: "likely_legit" | "risky" | "invalid";
  checks: VerificationCheck[];
};

export type BuildFromLinkedInResult = {
  profile: {
    fullName: string;
    companyName: string;
    linkedinUrl: string | null;
  };
  domainResolution: DomainResolution;
  candidates: EmailCandidate[];
  verifications: EmailLegitimacy[];
  bestCandidate: EmailLegitimacy | null;
};

type ToolDeps = {
  dnsLookup?: (domain: string) => Promise<DnsLookupResult>;
};

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "temp-mail.org",
  "tempmail.com",
  "yopmail.com",
  "sharklasers.com",
  "trashmail.com",
]);

const EMAIL_LOCAL_RE = /^[a-z0-9._%+-]{1,64}$/i;
const EMAIL_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function normalizeAsciiNameToken(value: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function normalizeDomain(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;

  const asEmailDomain = raw.includes("@") ? raw.split("@").pop() ?? "" : raw;
  const asUrl = asEmailDomain.includes("://") ? asEmailDomain : `https://${asEmailDomain}`;
  try {
    const host = new URL(asUrl).hostname.replace(/^www\./i, "");
    if (!host || !EMAIL_DOMAIN_RE.test(host)) return null;
    return rootDomainOnly(host);
  } catch {
    return null;
  }
}

function normalizeEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at >= value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!EMAIL_LOCAL_RE.test(local)) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return null;
  return `${local}@${normalizedDomain}`;
}

async function defaultDnsLookup(domain: string): Promise<DnsLookupResult> {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return { domain: domain.toLowerCase(), hasMx: false, hasA: false, hasAaaa: false, mxRecords: [] };
  }

  const [mxRes, aRes, aaaaRes] = await Promise.allSettled([
    resolveMx(normalized),
    resolve4(normalized),
    resolve6(normalized),
  ]);

  const mxRecords =
    mxRes.status === "fulfilled"
      ? mxRes.value.map(record => record.exchange.toLowerCase()).filter(Boolean)
      : [];
  const hasA = aRes.status === "fulfilled" && aRes.value.length > 0;
  const hasAaaa = aaaaRes.status === "fulfilled" && aaaaRes.value.length > 0;

  return {
    domain: normalized,
    hasMx: mxRecords.length > 0,
    hasA,
    hasAaaa,
    mxRecords,
  };
}

export function generateEmailCandidates(input: {
  fullName: string;
  domain: string;
  limit?: number;
}): EmailCandidate[] {
  const domain = normalizeDomain(input.domain);
  if (!domain) return [];

  const name = splitName(input.fullName);
  const first = normalizeAsciiNameToken(name.first);
  const last = normalizeAsciiNameToken(name.last);
  if (!first) return [];

  const candidates: EmailCandidate[] = [];
  const push = (localPart: string, pattern: EmailCandidate["pattern"], confidence: number) => {
    if (!localPart || !EMAIL_LOCAL_RE.test(localPart)) return;
    if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) return;
    candidates.push({
      email: `${localPart}@${domain}`,
      pattern,
      confidence,
    });
  };

  if (last) {
    push(`${first}.${last}`, "first.last", 0.8);
    push(`${first}${last}`, "firstlast", 0.74);
    push(`${first.slice(0, 1)}${last}`, "flast", 0.72);
    push(`${first}${last.slice(0, 1)}`, "firstl", 0.69);
    push(`${first.slice(0, 1)}.${last}`, "f.last", 0.67);
    push(`${first}.${last.slice(0, 1)}`, "first.l", 0.66);
  }
  push(first, "first", last ? 0.54 : 0.64);

  const dedup = new Map<string, EmailCandidate>();
  for (const candidate of candidates) {
    const prev = dedup.get(candidate.email);
    if (!prev || candidate.confidence > prev.confidence) {
      dedup.set(candidate.email, candidate);
    }
  }

  const max = Math.min(Math.max(input.limit ?? 6, 1), 12);
  return Array.from(dedup.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max);
}

export async function resolveCompanyDomainFromProfile(
  input: {
    companyName: string;
    companyWebsite?: string | null;
    companyDomainHint?: string | null;
  },
  deps: ToolDeps = {},
): Promise<DomainResolution> {
  const dnsLookup = deps.dnsLookup ?? defaultDnsLookup;
  const evidence: string[] = [];

  const hintDomain = normalizeDomain(input.companyDomainHint);
  if (hintDomain) {
    const dns = await dnsLookup(hintDomain);
    evidence.push(`Domain hint normalized to ${hintDomain}`);
    evidence.push(`DNS: mx=${dns.hasMx}, a_or_aaaa=${dns.hasA || dns.hasAaaa}`);
    return {
      domain: hintDomain,
      confidence: dns.hasMx ? 0.96 : dns.hasA || dns.hasAaaa ? 0.86 : 0.72,
      source: "domain_hint",
      evidence,
    };
  }

  const websiteDomain = normalizeDomain(input.companyWebsite);
  if (websiteDomain) {
    const dns = await dnsLookup(websiteDomain);
    evidence.push(`Website host normalized to ${websiteDomain}`);
    evidence.push(`DNS: mx=${dns.hasMx}, a_or_aaaa=${dns.hasA || dns.hasAaaa}`);
    return {
      domain: websiteDomain,
      confidence: dns.hasMx ? 0.92 : dns.hasA || dns.hasAaaa ? 0.82 : 0.68,
      source: "company_website",
      evidence,
    };
  }

  const companyName = (input.companyName ?? "").trim();
  if (!companyName) {
    return {
      domain: null,
      confidence: 0,
      source: "unresolved",
      evidence: ["No company name provided."],
    };
  }

  const candidates = generateDomainCandidates(companyName);
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const dns = await dnsLookup(candidate);
    if (!dns.hasMx && !dns.hasA && !dns.hasAaaa) continue;
    evidence.push(`Selected generated candidate ${dns.domain}`);
    evidence.push(`DNS: mx=${dns.hasMx}, a_or_aaaa=${dns.hasA || dns.hasAaaa}`);
    return {
      domain: dns.domain,
      confidence: dns.hasMx ? 0.78 : 0.64,
      source: "company_name_probe",
      evidence,
    };
  }

  return {
    domain: null,
    confidence: 0,
    source: "unresolved",
    evidence: ["Could not resolve domain from hint, website, or generated candidates."],
  };
}

export async function verifyEmailLegitimacy(
  email: string,
  deps: ToolDeps = {},
): Promise<EmailLegitimacy> {
  const dnsLookup = deps.dnsLookup ?? defaultDnsLookup;
  const normalizedEmail = normalizeEmail(email);
  const checks: VerificationCheck[] = [];

  if (!normalizedEmail) {
    checks.push({
      check: "syntax",
      status: "fail",
      detail: "Invalid email format.",
    });
    return {
      email,
      normalizedEmail: null,
      domain: null,
      isValidSyntax: false,
      isDisposableDomain: false,
      hasMx: false,
      hasAOrAaaa: false,
      catchAll: null,
      confidence: 0,
      verdict: "invalid",
      checks,
    };
  }

  const [, domain] = normalizedEmail.split("@");
  const rootDomain = rootDomainOnly(domain ?? "");
  const isDisposableDomain = DISPOSABLE_DOMAINS.has(rootDomain);
  const dns = await dnsLookup(domain ?? "");
  const hasAOrAaaa = dns.hasA || dns.hasAaaa;

  checks.push({
    check: "syntax",
    status: "pass",
    detail: "Email format is valid.",
  });
  checks.push({
    check: "domain_dns",
    status: dns.hasMx || hasAOrAaaa ? "pass" : "fail",
    detail: `DNS mx=${dns.hasMx}, a_or_aaaa=${hasAOrAaaa}.`,
  });
  checks.push({
    check: "disposable_domain",
    status: isDisposableDomain ? "warn" : "pass",
    detail: isDisposableDomain ? "Disposable domain detected." : "Domain is not disposable.",
  });
  checks.push({
    check: "catch_all",
    status: "warn",
    detail: "Catch-all mailbox detection is not available in passive mode.",
  });

  let confidence = 0;
  confidence += 0.35; // syntax passes
  if (dns.hasMx) confidence += 0.4;
  else if (hasAOrAaaa) confidence += 0.22;
  if (!isDisposableDomain) confidence += 0.15;
  if (dns.hasMx && !isDisposableDomain) confidence += 0.1;
  confidence = Math.min(1, Math.max(0, confidence));

  let verdict: EmailLegitimacy["verdict"] = "invalid";
  if (dns.hasMx && !isDisposableDomain && confidence >= 0.75) verdict = "likely_legit";
  else if ((dns.hasMx || hasAOrAaaa) && confidence >= 0.45) verdict = "risky";

  return {
    email,
    normalizedEmail,
    domain: rootDomain,
    isValidSyntax: true,
    isDisposableDomain,
    hasMx: dns.hasMx,
    hasAOrAaaa,
    catchAll: null,
    confidence: Number(confidence.toFixed(2)),
    verdict,
    checks,
  };
}

export async function buildEmailVerificationFromLinkedIn(
  input: {
    fullName: string;
    companyName: string;
    linkedinUrl?: string | null;
    companyWebsite?: string | null;
    companyDomainHint?: string | null;
    maxCandidates?: number;
  },
  deps: ToolDeps = {},
): Promise<BuildFromLinkedInResult> {
  const domainResolution = await resolveCompanyDomainFromProfile(
    {
      companyName: input.companyName,
      companyWebsite: input.companyWebsite,
      companyDomainHint: input.companyDomainHint,
    },
    deps,
  );

  const candidates =
    domainResolution.domain == null
      ? []
      : generateEmailCandidates({
          fullName: input.fullName,
          domain: domainResolution.domain,
          limit: input.maxCandidates,
        });

  const verifications: EmailLegitimacy[] = [];
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const verified = await verifyEmailLegitimacy(candidate.email, deps);
    verifications.push(verified);
  }

  const bestCandidate =
    verifications
      .slice()
      .sort((a, b) => {
        const rank = (v: EmailLegitimacy) =>
          v.verdict === "likely_legit" ? 2 : v.verdict === "risky" ? 1 : 0;
        return rank(b) - rank(a) || b.confidence - a.confidence;
      })[0] ?? null;

  return {
    profile: {
      fullName: input.fullName.trim(),
      companyName: input.companyName.trim(),
      linkedinUrl: (input.linkedinUrl ?? "").trim() || null,
    },
    domainResolution,
    candidates,
    verifications,
    bestCandidate,
  };
}
