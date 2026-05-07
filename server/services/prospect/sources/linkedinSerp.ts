// LinkedIn SERP scraping seed adapter.
//
// We never fetch linkedin.com directly (the `safeFetch` helper blocks it via
// the host blocklist). Instead we issue search-engine queries (Google,
// DuckDuckGo, Bing in that order) for `site:linkedin.com/company/* "<region>"`
// and `site:linkedin.com/in/* "<company>"`. Each result snippet contains
// enough text for us to extract a company slug or a person's name + title.
//
// The crawler caller is responsible for SERP daily-budget bookkeeping; this
// adapter just produces drafts.

import { safeFetch } from "../safeFetch";
import { classifyIndustry } from "../industryClassifier";
import {
  sanitizeLinkedinCompanyUrl,
  sanitizeLinkedinPersonUrl,
} from "../repository";
import type {
  CompanyDraft,
  EmployeeDraft,
  SeedAdapter,
  SeedRunInput,
  SeedRunResult,
} from "../types";
import { isExcludedCompanyName } from "../exclusions";
import type { ProspectCompany } from "../../../../drizzle/schema";

type SearchProvider = "google" | "duckduckgo" | "bing";

type SerpHit = {
  url: string;
  title: string;
  snippet: string;
};

function buildSearchUrl(provider: SearchProvider, query: string): string {
  const q = encodeURIComponent(query);
  switch (provider) {
    case "google":
      return `https://www.google.com/search?q=${q}&hl=en&gl=us&num=20`;
    case "duckduckgo":
      return `https://duckduckgo.com/html/?q=${q}`;
    case "bing":
      return `https://www.bing.com/search?q=${q}&count=30`;
  }
}

async function fetchSerp(query: string): Promise<{ provider: SearchProvider; html: string } | null> {
  for (const provider of ["google", "duckduckgo", "bing"] as SearchProvider[]) {
    const url = buildSearchUrl(provider, query);
    const res = await safeFetch(url, {
      accept: "text/html,application/xhtml+xml",
      timeoutMs: 12_000,
      maxBytes: 1_500_000,
      skipThrottle: true,
    });
    if (!res || !res.body) continue;
    return { provider, html: res.body };
  }
  return null;
}

const ANCHOR_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;

function decodeRedirectedHref(provider: SearchProvider, raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith("/url?q=")) {
    try {
      const u = new URL(`https://www.google.com${raw}`);
      const q = u.searchParams.get("q");
      if (q) return q;
    } catch {
      return null;
    }
  }
  if (provider === "duckduckgo" && raw.startsWith("//duckduckgo.com/l/")) {
    try {
      const u = new URL(`https:${raw}`);
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("http")) return raw;
  return null;
}

function extractLinkedinCompanyHits(provider: SearchProvider, html: string): SerpHit[] {
  const hits: SerpHit[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html))) {
    const decoded = decodeRedirectedHref(provider, m[1] ?? "");
    if (!decoded) continue;
    if (!/linkedin\.com\/company\//i.test(decoded)) continue;
    const text = stripHtml(m[2] ?? "");
    if (!text) continue;
    hits.push({ url: decoded, title: text, snippet: text });
    if (hits.length >= 25) break;
  }
  return hits;
}

function extractLinkedinPersonHits(provider: SearchProvider, html: string): SerpHit[] {
  const hits: SerpHit[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html))) {
    const decoded = decodeRedirectedHref(provider, m[1] ?? "");
    if (!decoded) continue;
    if (!/linkedin\.com\/in\//i.test(decoded)) continue;
    const text = stripHtml(m[2] ?? "");
    if (!text) continue;
    hits.push({ url: decoded, title: text, snippet: text });
    if (hits.length >= 25) break;
  }
  return hits;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function deriveCompanyNameFromHit(hit: SerpHit): string | null {
  // Title formats commonly seen:
  //   "<Name> | LinkedIn"
  //   "<Name> - LinkedIn"
  //   "<Name>: <tag> | LinkedIn"
  const cleaned = hit.title.replace(/\s+/g, " ").trim();
  const stripped = cleaned
    .replace(/\s*\|\s*linkedin.*/i, "")
    .replace(/\s*-\s*linkedin.*/i, "")
    .replace(/\s*:\s*overview.*/i, "")
    .trim();
  if (!stripped) return null;
  if (isExcludedCompanyName(stripped)) return null;
  if (stripped.length < 2 || stripped.length > 200) return null;
  return stripped;
}

function derivePersonFromHit(hit: SerpHit): { fullName: string; title: string | null } | null {
  // Title formats:
  //   "<Name> - <title> - <Company> | LinkedIn"
  //   "<Name> | LinkedIn"
  const cleaned = hit.title.replace(/\s+/g, " ").trim();
  const cut = cleaned.replace(/\s*\|\s*linkedin.*/i, "").trim();
  if (!cut) return null;
  const parts = cut.split(/\s*-\s*|\s*–\s*|\s*—\s*/g).filter(Boolean);
  const fullName = parts[0]?.trim() ?? "";
  if (!fullName) return null;
  if (fullName.split(/\s+/g).length < 2) return null;
  const title = parts[1]?.trim() || null;
  return { fullName, title };
}

function deriveCompanyHintFromHit(hit: SerpHit): string | null {
  const cleaned = hit.title.replace(/\s+/g, " ").trim();
  const cut = cleaned.replace(/\s*\|\s*linkedin.*/i, "").trim();
  const parts = cut.split(/\s*-\s*|\s*–\s*|\s*—\s*/g).filter(Boolean);
  if (parts.length < 3) return null;
  return parts[parts.length - 1]?.trim() ?? null;
}

/* ------------------------------------------------------------------ */
/* Adapters                                                           */
/* ------------------------------------------------------------------ */

export const linkedinSerpSeedAdapter: SeedAdapter = {
  kind: "linkedin_company_serp",
  async run(input: SeedRunInput): Promise<SeedRunResult> {
    const payload = input.payload ?? {};
    const hint = (payload.searchHint as string | null) ?? input.region;
    const country = (payload.countryCode as string | null) ?? null;
    const admin1 = (payload.admin1 as string | null) ?? null;
    const queries = [
      `site:linkedin.com/company "${hint}"`,
      `site:linkedin.com/company "${hint}" technology`,
      `site:linkedin.com/company "${hint}" services`,
    ];
    const seenSlugs = new Set<string>();
    const companies: CompanyDraft[] = [];
    for (const query of queries) {
      const serp = await fetchSerp(query);
      if (!serp) continue;
      const hits = extractLinkedinCompanyHits(serp.provider, serp.html);
      for (const hit of hits) {
        const linkedinUrl = sanitizeLinkedinCompanyUrl(hit.url);
        if (!linkedinUrl) continue;
        const slug = linkedinUrl.split("/").pop() ?? "";
        if (!slug || seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);
        const name = deriveCompanyNameFromHit(hit);
        if (!name) continue;
        const classification = classifyIndustry({ name, websiteMeta: hit.snippet });
        companies.push({
          name,
          linkedinUrl,
          hqCountry: country,
          hqAdmin1: admin1,
          industryCode: classification.code ?? null,
          subIndustryCode: classification.subCode ?? null,
          source: "linkedin_serp",
          sourceEvidenceUrl: hit.url,
        });
        if (companies.length >= 30) break;
      }
      if (companies.length >= 30) break;
    }
    return { companies, employees: [] };
  },
};

/**
 * Promotes companies that don't yet have a `harvest_employee` job into the
 * employee discovery queue. Runs as its own seed kind so we don't entangle the
 * cron schedule with `companies` table state.
 */
export const linkedinEmployeePromoteAdapter: SeedAdapter = {
  kind: "linkedin_employee_serp_promote",
  async run(_input: SeedRunInput): Promise<SeedRunResult> {
    const { promoteCompaniesIntoEmployeeQueue } = await import("./linkedinEmployeePromote");
    const companyIds = await promoteCompaniesIntoEmployeeQueue(50);
    return {
      companies: [],
      employees: [],
      followupJobs: companyIds.map(id => ({
        kind: "harvest_employee" as const,
        payload: { companyId: id },
        priority: 6,
      })),
    };
  },
};

/* ------------------------------------------------------------------ */
/* Per-company employee harvest                                       */
/* ------------------------------------------------------------------ */

export async function harvestEmployeesForCompany(company: ProspectCompany): Promise<EmployeeDraft[]> {
  if (company.status !== "active") return [];
  const queries = [
    `site:linkedin.com/in "${company.name}" CEO`,
    `site:linkedin.com/in "${company.name}" "Head of"`,
    `site:linkedin.com/in "${company.name}" CTO`,
    `site:linkedin.com/in "${company.name}" CFO`,
    `site:linkedin.com/in "${company.name}" founder`,
  ];
  const seenSlugs = new Set<string>();
  const drafts: EmployeeDraft[] = [];
  const { upsertEmployee } = await import("../repository");
  const { enqueueJobs } = await import("../repository");

  for (const query of queries) {
    const serp = await fetchSerp(query);
    if (!serp) continue;
    const hits = extractLinkedinPersonHits(serp.provider, serp.html);
    for (const hit of hits) {
      const linkedinUrl = sanitizeLinkedinPersonUrl(hit.url);
      if (!linkedinUrl) continue;
      const slug = linkedinUrl.split("/").pop() ?? "";
      if (!slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      const person = derivePersonFromHit(hit);
      if (!person) continue;
      const companyHint = deriveCompanyHintFromHit(hit);
      // Skip results whose trailing chunk doesn't look like our target company.
      if (companyHint && !companyHint.toLowerCase().includes(company.name.split(/\s+/)[0]!.toLowerCase())) {
        continue;
      }
      const draft: EmployeeDraft = {
        companyId: company.id,
        companyDomainHint: company.domain ?? null,
        companyNameHint: company.name,
        fullName: person.fullName,
        title: person.title,
        linkedinUrl,
        source: "linkedin_serp",
        sourceEvidenceUrl: hit.url,
      };
      drafts.push(draft);
      const emp = await upsertEmployee(draft);
      if (emp && !emp.email && emp.emailStatus === "unknown") {
        await enqueueJobs([
          { kind: "guess_emails", payload: { employeeId: emp.id }, priority: 2 },
        ]);
      }
      if (drafts.length >= 12) break;
    }
    if (drafts.length >= 12) break;
  }
  return drafts;
}
