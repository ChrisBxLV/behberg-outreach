import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { getDb, createContact } from "../db";
import { signals } from "../../drizzle/schema";
import { resolveCompanyDomainDeterministic } from "./companyDomainResolver";
import {
  domainContainsCompany,
  guessEmailsFromName,
  inferPatternFromPublicEmails,
  matchesSignalNeedles,
  rootDomainOnly,
  splitName,
  titleSynonymsForInput,
} from "./prospectingV1Utils";

type RunInput = {
  organizationId: number;
  industry: string;
  title: string;
  country?: string;
  companies: string[];
  maxCompanies: number;
};

export type ProspectingV1Candidate = {
  id: string;
  company: string;
  domain: string | null;
  fullName: string | null;
  matchedTitle: string | null;
  evidenceUrl: string | null;
  guessedEmails: Array<{ email: string; confidence: number; reason: string }>;
};

export type ProspectingV1Result = {
  items: ProspectingV1Candidate[];
  stats: {
    companiesProcessed: number;
    candidatesFound: number;
    companiesSeeded: number;
    companiesWithDomain: number;
    companiesWithoutDomain: number;
    pagesAttempted: number;
    pagesFetched: number;
    fallbackSearchCompanies: number;
    zeroResultReason: string | null;
  };
};

export type ProspectingV1Status =
  | {
      organizationId: number;
      runId: string;
      state: "running";
      step: "seeding_companies" | "resolving_domains" | "crawling_sites" | "done";
      progress: { companiesTotal: number; companiesDone: number };
      startedAt: number;
    }
  | {
      organizationId: number;
      runId: string;
      state: "done";
      step: "done";
      progress: { companiesTotal: number; companiesDone: number };
      startedAt: number;
      finishedAt: number;
      result: ProspectingV1Result;
    }
  | {
      organizationId: number;
      runId: string;
      state: "error";
      step: "error";
      progress: { companiesTotal: number; companiesDone: number };
      startedAt: number;
      finishedAt: number;
      error: string;
    };

const RUN_TTL_MS = 1000 * 60 * Math.max(5, Number(process.env.PROSPECTING_V1_RUN_TTL_MINUTES ?? "20") || 20);
const RUN_HARD_TIMEOUT_MS =
  1000 * 60 * Math.max(15, Number(process.env.PROSPECTING_V1_HARD_TIMEOUT_MINUTES ?? "60") || 60);
const MAX_ACTIVE_RUNS_PER_ORG = Math.max(
  1,
  Math.min(5, Number(process.env.PROSPECTING_V1_MAX_ACTIVE_RUNS_PER_ORG ?? "2") || 2),
);
const runs = new Map<string, ProspectingV1Status>();

function cleanupRuns(now = Date.now()) {
  runs.forEach((s, id) => {
    if (s.state === "running") {
      if (now - s.startedAt > RUN_HARD_TIMEOUT_MS) runs.delete(id);
      return;
    }
    if (now - s.finishedAt > RUN_TTL_MS) runs.delete(id);
  });
}

function setRun(runId: string, status: ProspectingV1Status) {
  runs.set(runId, status);
  cleanupRuns();
}

export function getProspectingV1Status(runId: string) {
  cleanupRuns();
  return runs.get(runId);
}

function normalizeCompanyName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text") && !ct.includes("html") && !ct.includes("xml")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmailsFromText(text: string, domain: string): string[] {
  const root = rootDomainOnly(domain);
  const re = /[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/g;
  const found = (text.match(re) ?? []).map(x => x.toLowerCase());
  const filtered = found.filter(e => e.endsWith(`@${root}`));
  return Array.from(new Set(filtered));
}

function extractDecisionMakersFromText(input: {
  text: string;
  titleNeedle: string;
  countryNeedle?: string;
}): Array<{ fullName: string; matchedTitle: string }> {
  const titleNeedle = input.titleNeedle.trim();
  if (!titleNeedle) return [];
  const countryNeedle = (input.countryNeedle ?? "").trim();

  // Split into pseudo-lines for heuristics.
  const rawLines = input.text
    .replace(/[•·|]/g, "\n")
    .replace(/\s{2,}/g, "\n")
    .split(/\n+/g)
    .map(l => l.trim())
    .filter(l => l.length >= 6 && l.length <= 140);

  const synonymNeedles = titleSynonymsForInput(titleNeedle);
  const titleRes = synonymNeedles.map(needle => ({
    needle,
    re: new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i"),
  }));
  const countryRe = countryNeedle ? new RegExp(`\\b${escapeRegExp(countryNeedle)}\\b`, "i") : null;

  const out: Array<{ fullName: string; matchedTitle: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";
    const matchedTitleEntry = titleRes.find(x => x.re.test(line));
    if (!matchedTitleEntry) continue;
    const window = [rawLines[i - 1], rawLines[i], rawLines[i + 1]].filter(Boolean).join(" ");
    if (countryRe && !countryRe.test(window)) continue;
    const name = guessNameFromSnippet(window);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fullName: name, matchedTitle: matchedTitleEntry.needle });
    if (out.length >= 12) break;
  }

  return out;
}

function guessNameFromSnippet(s: string): string | null {
  // Very simple heuristic: find 2-3 consecutive Capitalized words.
  const re = /\b([A-Z][a-z]{1,24})\s+([A-Z][a-z]{1,24})(?:\s+([A-Z][a-z]{1,24}))?\b/;
  const m = re.exec(s);
  if (!m) return null;
  const first = m[1] ?? "";
  const last = m[2] ?? "";
  const third = m[3] ?? "";
  const full = [first, last, third].filter(Boolean).join(" ").trim();
  return full.length >= 5 ? full : null;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAbsoluteHttpUrl(raw: string): string | null {
  try {
    const cleaned = raw.replace(/&amp;/gi, "&").trim();
    if (!/^https?:\/\//i.test(cleaned)) return null;
    const parsed = new URL(cleaned);
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractHttpUrlsFromHtml(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) {
    const href = m[1] ?? "";
    const abs = normalizeAbsoluteHttpUrl(href);
    if (!abs) continue;
    out.push(abs);
  }
  return Array.from(new Set(out));
}

function defaultCompanyPageCandidates(root: string): string[] {
  const base = `https://${root}`;
  return [
    `${base}/`,
    `${base}/about`,
    `${base}/team`,
    `${base}/leadership`,
    `${base}/company`,
    `${base}/contact`,
    `${base}/press`,
    `${base}/management`,
    `${base}/about-us`,
  ];
}

function likelyCompanyUrlsFromSearch(company: string, urls: string[]): string[] {
  const ranked = urls
    .map(u => {
      try {
        const host = new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
        const score = (domainContainsCompany(host, company) ? 2 : 0) + (u.includes("/about") || u.includes("/team") ? 1 : 0);
        return { url: u, host, score };
      } catch {
        return null;
      }
    })
    .filter((x): x is { url: string; host: string; score: number } => Boolean(x))
    .filter(x => !["google.com", "duckduckgo.com", "bing.com", "linkedin.com", "wikipedia.org"].some(h => x.host === h || x.host.endsWith(`.${h}`)))
    .sort((a, b) => b.score - a.score);

  const seenHosts = new Set<string>();
  const out: string[] = [];
  for (const r of ranked) {
    if (seenHosts.has(r.host)) continue;
    seenHosts.add(r.host);
    out.push(...defaultCompanyPageCandidates(rootDomainOnly(r.host)));
    if (seenHosts.size >= 2) break;
  }
  return Array.from(new Set(out)).slice(0, 14);
}

async function discoverCompanyUrlsWithoutDomain(company: string): Promise<string[]> {
  const q = encodeURIComponent(`${company} leadership team`);
  const providers = [
    `https://www.google.com/search?q=${q}&hl=en&gl=us&num=5`,
    `https://duckduckgo.com/html/?q=${q}`,
    `https://www.bing.com/search?q=${q}&count=10`,
  ];
  const discovered: string[] = [];
  for (const provider of providers) {
    // eslint-disable-next-line no-await-in-loop
    const html = await fetchText(provider, 8_000);
    if (!html) continue;
    extractHttpUrlsFromHtml(html).forEach(u => discovered.push(u));
  }
  return likelyCompanyUrlsFromSearch(company, discovered);
}

async function seedCompaniesFromSignals(input: RunInput): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      companyName: signals.companyName,
      headline: signals.headline,
      tags: signals.tags,
    })
    .from(signals)
    .where(eq(signals.organizationId, input.organizationId))
    .orderBy(desc(signals.occurredAt))
    .limit(500);

  const industryNeedle = input.industry.trim().toLowerCase();
  const countryNeedle = (input.country ?? "").trim().toLowerCase();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const company = (r.companyName ?? "").trim();
    if (!company) continue;
    const key = company.toLowerCase();
    if (seen.has(key)) continue;

    const hay = `${r.headline ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase();
    if (!matchesSignalNeedles({ haystack: hay, industryNeedle, countryNeedle })) continue;

    seen.add(key);
    out.push(company);
    if (out.length >= input.maxCompanies) break;
  }
  return out;
}

async function runV1(input: RunInput, runId: string) {
  const startedAt = Date.now();
  let companies = input.companies.map(normalizeCompanyName).filter(Boolean);
  let companiesSeeded = 0;

  setRun(runId, {
    organizationId: input.organizationId,
    runId,
    state: "running",
    step: "seeding_companies",
    progress: { companiesTotal: Math.min(input.maxCompanies, companies.length || input.maxCompanies), companiesDone: 0 },
    startedAt,
  });

  if (companies.length === 0) {
    companies = await seedCompaniesFromSignals(input);
    companiesSeeded = companies.length;
  }
  companies = companies.slice(0, input.maxCompanies);

  setRun(runId, {
    organizationId: input.organizationId,
    runId,
    state: "running",
    step: "resolving_domains",
    progress: { companiesTotal: companies.length, companiesDone: 0 },
    startedAt,
  });

  const items: ProspectingV1Candidate[] = [];
  const seenCandidates = new Set<string>();
  let companiesWithDomain = 0;
  let companiesWithoutDomain = 0;
  let pagesAttempted = 0;
  let pagesFetched = 0;
  let fallbackSearchCompanies = 0;
  let companiesDone = 0;

  for (const company of companies) {
    const domainPromise = resolveCompanyDomainDeterministic({
      company,
      article_html: "",
      article_text: "",
    })
      .then(result => result.domain)
      .catch(() => null);
    const domain = await Promise.race([
      domainPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000)),
    ]);
    const root = domain ? rootDomainOnly(domain) : null;
    if (root) companiesWithDomain++;
    else companiesWithoutDomain++;

    setRun(runId, {
      organizationId: input.organizationId,
      runId,
      state: "running",
      step: "crawling_sites",
      progress: { companiesTotal: companies.length, companiesDone },
      startedAt,
    });

    const urls = root ? defaultCompanyPageCandidates(root) : await discoverCompanyUrlsWithoutDomain(company);
    if (!root && urls.length > 0) fallbackSearchCompanies++;

    const publicEmails = new Set<string>();
    let patternHint: "first.last" | "flast" | null = null;

    for (const url of urls) {
      pagesAttempted++;
      const html = await fetchText(url, 12_000);
      if (!html) continue;
      pagesFetched++;
      const text = stripHtml(html);

      if (root) {
        extractEmailsFromText(text, root).forEach(e => publicEmails.add(e));
      }

      const decisionMakers = extractDecisionMakersFromText({
        text,
        titleNeedle: input.title,
        countryNeedle: input.country,
      });

      if (root && publicEmails.size >= 3 && !patternHint) {
        patternHint = inferPatternFromPublicEmails(Array.from(publicEmails), root);
      }

      for (const dm of decisionMakers) {
        const id = randomUUID().slice(0, 12);
        const { first, last } = splitName(dm.fullName);
        const guessed = root
          ? guessEmailsFromName({ first, last, domain: root, patternHint })
          : [];
        const candidateKey = `${company.toLowerCase()}::${(dm.fullName ?? "").toLowerCase()}::${dm.matchedTitle.toLowerCase()}`;
        if (seenCandidates.has(candidateKey)) continue;
        seenCandidates.add(candidateKey);
        items.push({
          id,
          company,
          domain: root,
          fullName: dm.fullName,
          matchedTitle: dm.matchedTitle,
          evidenceUrl: url,
          guessedEmails: guessed,
        });
      }

      if (items.length >= input.maxCompanies * 12) break;
    }

    companiesDone++;
  }

  const result: ProspectingV1Result = {
    items,
    stats: {
      companiesProcessed: companies.length,
      candidatesFound: items.length,
      companiesSeeded,
      companiesWithDomain,
      companiesWithoutDomain,
      pagesAttempted,
      pagesFetched,
      fallbackSearchCompanies,
      zeroResultReason:
        items.length > 0
          ? null
          : companies.length === 0
            ? "No companies were available from Signals for the selected filters."
            : pagesFetched === 0
              ? "Could not fetch candidate pages for selected companies. Domain discovery likely failed."
              : "Candidate pages were fetched, but no matching people/title patterns were found.",
    },
  };

  setRun(runId, {
    organizationId: input.organizationId,
    runId,
    state: "done",
    step: "done",
    progress: { companiesTotal: companies.length, companiesDone: companies.length },
    startedAt,
    finishedAt: Date.now(),
    result,
  });
}

export async function startProspectingV1Run(input: RunInput): Promise<string> {
  cleanupRuns();
  const active = Array.from(runs.values()).filter(
    r => r.organizationId === input.organizationId && r.state === "running",
  );
  if (active.length >= MAX_ACTIVE_RUNS_PER_ORG) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many active prospecting runs. Please wait for a run to finish.",
    });
  }

  const runId = randomUUID();
  setRun(runId, {
    organizationId: input.organizationId,
    runId,
    state: "running",
    step: "seeding_companies",
    progress: { companiesTotal: input.maxCompanies, companiesDone: 0 },
    startedAt: Date.now(),
  });

  void runV1(input, runId).catch(err => {
    const error = err instanceof Error ? err.message : "Unknown error";
    const startedAt = runs.get(runId)?.startedAt ?? Date.now();
    setRun(runId, {
      organizationId: input.organizationId,
      runId,
      state: "error",
      step: "error",
      progress: runs.get(runId)?.progress ?? { companiesTotal: 0, companiesDone: 0 },
      startedAt,
      finishedAt: Date.now(),
      error,
    });
  });

  return runId;
}

export async function importProspectingV1Selected(input: {
  organizationId: number;
  runId: string;
  candidateIds: string[];
}): Promise<number> {
  const status = getProspectingV1Status(input.runId);
  if (!status || status.organizationId !== input.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
  }
  if (status.state !== "done") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Run not completed yet." });
  }

  const candidateIdSet = new Set(input.candidateIds);
  const selected = status.result.items.filter(i => candidateIdSet.has(i.id));
  let imported = 0;
  for (const item of selected) {
    const best = item.guessedEmails[0];
    const email = best?.email;
    try {
      await createContact({
        organizationId: input.organizationId,
        source: "prospecting_v1",
        stage: "enriched",
        tags: [],
        company: item.company,
        companyWebsite: item.domain ? `https://${item.domain}` : undefined,
        fullName: item.fullName ?? undefined,
        title: item.matchedTitle ?? undefined,
        email: email ?? undefined,
        emailStatus: email ? "risky" : "unknown",
        emailConfidence: email ? best?.confidence ?? 0.5 : undefined,
        notes: item.evidenceUrl ? `Evidence: ${item.evidenceUrl}` : undefined,
      });
      imported++;
    } catch {
      continue;
    }
  }
  return imported;
}

