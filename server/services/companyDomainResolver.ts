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

function rootDomainOnly(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./i, "");
  const labels = d.split(".").filter(Boolean);
  if (labels.length <= 2) return d;

  const publicSuffix3Labels = ["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "org.au", "net.au", "co.jp"];
  const last3 = labels.slice(-3).join(".");
  if (publicSuffix3Labels.includes(last3)) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
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

function companyFragments(company: string): string[] {
  const c = company.toLowerCase().trim();
  if (!c) return [];
  return c
    .split(/\s+/g)
    .map(x => x.replace(/[^a-z0-9]/g, ""))
    .filter(x => x.length >= 3)
    .slice(0, 5);
}

function domainContainsCompany(domain: string, company: string): boolean {
  const d = domain.toLowerCase();
  const frags = companyFragments(company);
  if (frags.length === 0) return false;
  return frags.some(f => d.includes(f));
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

  // Fallback: search query
  const query = `${company} official website`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&num=1`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "BehbergSignalsBot/1.0 (+https://behberg.com)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    const explicit = (() => {
      const domains = extractExplicitDomainsFromText(input.article_text ?? "");
      const freq = new Map<string, number>();
      domains.forEach(d => freq.set(d, (freq.get(d) ?? 0) + 1));

      const ranked: Array<{ domain: string; count: number; score: number }> = [];
      const frags = companyFragments(company);
      freq.forEach((count, d) => {
        const root = normalizeDomainForOutput(d);
        if (DOMAIN_BLACKLIST.some(b => root === b || root.endsWith(`.${b}`))) return;
        let score = 0;
        const contains = frags.some(f => root.includes(f));
        if (contains) score += 0.5;
        if (count > 1) score += 0.3;
        if (!contains) score -= 0.6;
        ranked.push({ domain: root, count, score });
      });
      ranked.sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best || best.score < 0.5) return null;
      return { domain: best.domain, domain_confidence: 0.86 };
    })();

    return explicit ?? { domain: null, domain_confidence: null };
  }
  const html = await res.text();
  const firstUrl = extractFirstOrganicResultUrlFromGoogleSearch(html);
  if (!firstUrl) {
    const explicit = (() => {
      const domains = extractExplicitDomainsFromText(input.article_text ?? "");
      const freq = new Map<string, number>();
      domains.forEach(d => freq.set(d, (freq.get(d) ?? 0) + 1));
      const ranked: Array<{ domain: string; score: number }> = [];
      const frags = companyFragments(company);
      freq.forEach((count, d) => {
        const root = normalizeDomainForOutput(d);
        if (DOMAIN_BLACKLIST.some(b => root === b || root.endsWith(`.${b}`))) return;
        const contains = frags.some(f => root.includes(f));
        let score = 0;
        if (contains) score += 0.5;
        if (count > 1) score += 0.3;
        if (!contains) score -= 0.6;
        ranked.push({ domain: root, score });
      });
      ranked.sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best || best.score < 0.5) return null;
      return { domain: best.domain, domain_confidence: 0.86 };
    })();
    return explicit ?? { domain: null, domain_confidence: null };
  }

  const host = normalizeHrefDomain(firstUrl);
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

