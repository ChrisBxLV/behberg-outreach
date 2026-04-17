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
    // Ignore invalid URLs.
    return null;
  }
}

function extractHrefDomainsFromArticleHtml(article_html: string): string[] {
  const domains: string[] = [];
  // Extract href="..." domains only. We don't attempt to resolve relative URLs.
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

function extractFirstOrganicResultUrlFromGoogleSearch(html: string): string | null {
  // Parse links of the form: /url?q=<URL>&...
  const re = /href\s*=\s*["']\/url\?q=([^&"']+)&/gi;
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) {
    const enc = m[1] ?? "";
    try {
      const decoded = decodeURIComponent(enc);
      // Ignore non-http(s) URLs.
      if (!/^https?:\/\//i.test(decoded)) continue;
      return decoded;
    } catch {
      continue;
    }
  }
  return null;
}

function extractFirstHttpUrlByHostHint(html: string, hostHint: string): string | null {
  const blockedHosts = new Set(["google.com", "duckduckgo.com", "bing.com", "yahoo.com"]);
  const attrRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = attrRe.exec(html)) !== null) {
    const href = m[1] ?? "";
    if (!href || href.startsWith("/")) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    if (!href.toLowerCase().includes(hostHint.toLowerCase())) continue;
    const host = normalizeHrefDomain(href);
    if (!host) continue;
    const root = normalizeDomainForOutput(host);
    if (blockedHosts.has(root)) continue;
    return href;
  }
  return null;
}

function normalizeDomainForOutput(domain: string): string {
  const root = rootDomainOnly(domain);
  return root.replace(/^www\./i, "").toLowerCase();
}

function extractExplicitDomainsFromText(article_text: string): string[] {
  const text = article_text ?? "";
  // Heuristic: capture domain-like tokens only (no paths).
  const re = /\b((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?:\b|\/)/g;
  const found: string[] = [];
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? "";
    if (!raw) continue;
    // Skip obvious social/profile patterns by blacklist later.
    const host = raw.replace(/^www\./i, "").toLowerCase();
    found.push(host);
  }
  return found;
}

function confidenceFromEvidence(containsCompany: boolean): number {
  // Per rules:
  // - 0.9+ = strong match (contains company name)
  // - 0.6-0.8 = inferred from search
  // - <0.5 = weak -> null
  if (containsCompany) return 0.92;
  return 0.55;
}

export async function resolveCompanyDomainDeterministic(
  input: ResolveInput,
): Promise<ResolveOutput> {
  const company = input.company?.trim() ?? "";
  if (!company) return { domain: null, domain_confidence: null };

  const hrefDomains = extractHrefDomainsFromArticleHtml(input.article_html || "");

  const freq = new Map<string, number>();
  hrefDomains.forEach(d => {
    const norm = d.replace(/^www\./i, "");
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  });

  const publisherDomainCandidate = (() => {
    // "article publisher domain": approximated as the most frequently occurring href domain.
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

  const best = ranked[0];
  if (best && best.score >= 0.5 && best.score > 0) {
    const normalized = normalizeDomainForOutput(best.domain);
    const contains = domainContainsCompany(best.domain, company);
    const conf = confidenceFromEvidence(contains);
    if (conf < 0.5) return { domain: null, domain_confidence: null };
    return { domain: normalized, domain_confidence: conf };
  }

  const searchHeader = {
    "user-agent": "BehbergSignalsBot/1.0 (+https://behberg.com)",
    accept: "text/html,application/xhtml+xml",
  };
  const firstUrlFromSearch = await (async () => {
    const query = `${company} official website`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&num=1`;
    try {
      const googleRes = await fetch(googleUrl, { headers: searchHeader });
      if (googleRes.ok) {
        const html = await googleRes.text();
        const parsed =
          extractFirstOrganicResultUrlFromGoogleSearch(html) ??
          extractFirstHttpUrlByHostHint(html, company.split(/\s+/g)[0] ?? company);
        if (parsed) return parsed;
      }
    } catch {
      // try next provider
    }

    const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const ddgRes = await fetch(ddgUrl, { headers: searchHeader });
      if (ddgRes.ok) {
        const html = await ddgRes.text();
        const parsed = extractFirstHttpUrlByHostHint(html, company.split(/\s+/g)[0] ?? company);
        if (parsed) return parsed;
      }
    } catch {
      // try next provider
    }

    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5`;
    try {
      const bingRes = await fetch(bingUrl, { headers: searchHeader });
      if (bingRes.ok) {
        const html = await bingRes.text();
        const parsed = extractFirstHttpUrlByHostHint(html, company.split(/\s+/g)[0] ?? company);
        if (parsed) return parsed;
      }
    } catch {
      // no-op
    }
    return null;
  })();

  if (!firstUrlFromSearch) {
    const explicit = await (async () => {
      const domains = extractExplicitDomainsFromText(input.article_text ?? "");
      const freq = new Map<string, number>();
      domains.forEach(d => freq.set(d, (freq.get(d) ?? 0) + 1));
      const ranked: Array<{ domain: string; score: number }> = [];
      freq.forEach((count, d) => {
        const root = normalizeDomainForOutput(d);
        if (DOMAIN_BLACKLIST.some(b => root === b || root.endsWith(`.${b}`))) return;
        const contains = domainContainsCompany(root, company);
        let score = 0;
        if (contains) score += 0.5;
        if (count > 1) score += 0.3;
        if (!contains) score -= 0.6;
        ranked.push({ domain: root, score });
      });
      ranked.sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (best && best.score >= 0.5) return { domain: best.domain, domain_confidence: 0.86 };

      // Last free fallback: deterministic direct-domain probes.
      const candidates = generateDomainCandidates(company);
      for (const candidate of candidates) {
        if (DOMAIN_BLACKLIST.some(b => candidate === b || candidate.endsWith(`.${b}`))) continue;
        // eslint-disable-next-line no-await-in-loop
        const ok = await probeDomain(candidate);
        if (!ok) continue;
        return {
          domain: normalizeDomainForOutput(candidate),
          domain_confidence: domainContainsCompany(candidate, company) ? 0.74 : 0.62,
        };
      }
      return null;
    })();
    return explicit ?? { domain: null, domain_confidence: null };
  }

  const host = normalizeHrefDomain(firstUrlFromSearch);
  if (!host) return { domain: null, domain_confidence: null };
  const root = normalizeDomainForOutput(host);

  if (DOMAIN_BLACKLIST.some(b => root === b || root.endsWith(`.${b}`))) {
    return { domain: null, domain_confidence: null };
  }
  if (publisherDomainCandidate) {
    const publisherRoot = normalizeDomainForOutput(publisherDomainCandidate);
    if (publisherRoot === root) {
      return { domain: null, domain_confidence: null };
    }
  }

  // Search-derived confidence:
  // 0.6–0.8 inferred from search; reduce if we can't match company.
  const contains = domainContainsCompany(root, company);
  const conf = contains ? 0.78 : 0.66;
  if (conf < 0.5) return { domain: null, domain_confidence: null };

  return { domain: root, domain_confidence: conf };
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

