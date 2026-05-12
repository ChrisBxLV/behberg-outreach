import {
  domainContainsCompany,
  generateDomainCandidates,
  rootDomainOnly,
} from "./prospectingV1Utils";

type ResolveInput = {
  company: string;
  article_html: string;
  article_text: string;
};

export type ResolveOutput = {
  domain: string | null;
  domain_confidence: number | null;
};

const DOMAIN_BLACKLIST = [
  "linkedin.com",
  "crunchbase.com",
  "wikipedia.org",
  "twitter.com",
  "facebook.com",
  "instagram.com",
];

function normalizeHrefDomain(raw: string): string | null {
  try {
    const url = new URL(raw);
    let host = url.hostname.toLowerCase();
    host = host.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

function extractHrefDomainsFromArticleHtml(article_html: string): string[] {
  const domains: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(article_html)) !== null) {
    const href = m[1] ?? "";
    const normalized = normalizeHrefDomain(href);
    if (normalized) domains.push(normalized);
  }
  return domains;
}

export function normalizeDomainForOutput(domain: string): string {
  const root = rootDomainOnly(domain);
  return root.replace(/^www\./i, "").toLowerCase();
}

function extractExplicitDomainsFromText(article_text: string): string[] {
  const text = article_text ?? "";
  const re = /\b((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?:\b|\/)/g;
  const found: string[] = [];
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? "";
    if (!raw) continue;
    const host = raw.replace(/^www\./i, "").toLowerCase();
    found.push(host);
  }
  return found;
}

function confidenceFromEvidence(containsCompany: boolean): number {
  if (containsCompany) return 0.92;
  return 0.55;
}

/**
 * Domains inferred only from article hrefs and explicit domain-like tokens in
 * text — no search engines, no live HTTP probes.
 */
export function tryResolveCompanyDomainFromEvidence(input: ResolveInput): ResolveOutput | null {
  const company = input.company?.trim() ?? "";
  if (!company) return null;

  const hrefDomains = extractHrefDomainsFromArticleHtml(input.article_html || "");

  const freq = new Map<string, number>();
  hrefDomains.forEach(d => {
    const norm = d.replace(/^www\./i, "");
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  });

  const publisherDomainCandidate = (() => {
    let bestDomain: string | null = null;
    let bestCount = -1;
    freq.forEach((count, domain) => {
      if (count > bestCount) {
        bestCount = count;
        bestDomain = domain;
      }
    });
    return bestDomain;
  })();

  const ranked: Array<{ domain: string; count: number; score: number; contains: boolean }> = [];
  freq.forEach((count, domain) => {
    if (publisherDomainCandidate && domain === publisherDomainCandidate) return;
    let score = 0;
    const contains = domainContainsCompany(domain, company);
    if (contains) score += 0.5;
    if (count > 1) score += 0.3;
    if (DOMAIN_BLACKLIST.some(b => domain === b || domain.endsWith(`.${b}`))) score -= 1.0;
    ranked.push({ domain, count, score, contains });
  });

  ranked.sort((a, b) => b.score - a.score);

  const hrefBest = ranked[0];
  if (hrefBest && hrefBest.score >= 0.5 && hrefBest.score > 0) {
    const normalized = normalizeDomainForOutput(hrefBest.domain);
    const contains = domainContainsCompany(hrefBest.domain, company);
    const conf = confidenceFromEvidence(contains);
    if (conf < 0.5) return null;
    return { domain: normalized, domain_confidence: conf };
  }

  const domains = extractExplicitDomainsFromText(input.article_text ?? "");
  const textFreq = new Map<string, number>();
  domains.forEach(d => textFreq.set(d, (textFreq.get(d) ?? 0) + 1));
  const textRanked: Array<{ domain: string; score: number }> = [];
  textFreq.forEach((count, d) => {
    const root = normalizeDomainForOutput(d);
    if (DOMAIN_BLACKLIST.some(b => root === b || root.endsWith(`.${b}`))) return;
    const contains = domainContainsCompany(root, company);
    let score = 0;
    if (contains) score += 0.5;
    if (count > 1) score += 0.3;
    if (!contains) score -= 0.6;
    textRanked.push({ domain: root, score });
  });
  textRanked.sort((a, b) => b.score - a.score);
  const textBest = textRanked[0];
  if (textBest && textBest.score >= 0.5) {
    return { domain: textBest.domain, domain_confidence: 0.86 };
  }

  return null;
}

/** Deterministic hostname guesses from the company name (no network). */
export function listDeterministicCompanyDomainCandidates(company: string): string[] {
  const trimmed = company?.trim() ?? "";
  if (!trimmed) return [];
  const out: string[] = [];
  for (const candidate of generateDomainCandidates(trimmed)) {
    if (DOMAIN_BLACKLIST.some(b => candidate === b || candidate.endsWith(`.${b}`))) continue;
    out.push(candidate);
  }
  return out;
}

/**
 * Resolve a company website domain without search-engine HTML scraping: article
 * evidence, explicit domains in text, then deterministic name-based candidates
 * with a lightweight HTTPS GET probe (non–Prospect callers; Prospect DB uses
 * `safeFetch` in `prospect/domainResolver.ts` instead of this probe).
 */
export async function resolveCompanyDomainDeterministic(
  input: ResolveInput,
): Promise<ResolveOutput> {
  const company = input.company?.trim() ?? "";
  if (!company) return { domain: null, domain_confidence: null };

  const fromEvidence = tryResolveCompanyDomainFromEvidence(input);
  if (fromEvidence?.domain) return fromEvidence;

  for (const candidate of listDeterministicCompanyDomainCandidates(company)) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await probeDomain(candidate);
    if (!ok) continue;
    return {
      domain: normalizeDomainForOutput(candidate),
      domain_confidence: domainContainsCompany(candidate, company) ? 0.74 : 0.62,
    };
  }

  return { domain: null, domain_confidence: null };
}

async function probeDomain(domain: string): Promise<boolean> {
  const url = `https://${domain}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      redirect: "follow",
      headers: { "user-agent": "BehbergSignalsBot/1.0 (+https://behberg.com)" },
    });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    return ct.includes("text/html") || ct.includes("text/plain") || ct === "";
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
