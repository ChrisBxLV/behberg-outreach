import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { getDb, createContact } from "../db";
import { signals } from "../../drizzle/schema";
import { resolveCompanyDomainDeterministic } from "./companyDomainResolver";

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
const MAX_ACTIVE_RUNS_PER_ORG = Math.max(
  1,
  Math.min(5, Number(process.env.PROSPECTING_V1_MAX_ACTIVE_RUNS_PER_ORG ?? "2") || 2),
);
const runs = new Map<string, ProspectingV1Status>();

function setRun(runId: string, status: ProspectingV1Status) {
  runs.set(runId, status);
  const now = Date.now();
  for (const [id, s] of Array.from(runs.entries())) {
    if (now - s.startedAt > RUN_TTL_MS) runs.delete(id);
  }
}

export function getProspectingV1Status(runId: string) {
  return runs.get(runId);
}

function normalizeCompanyName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function rootDomainOnly(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./i, "");
  const labels = d.split(".").filter(Boolean);
  if (labels.length <= 2) return d;
  const publicSuffix3Labels = ["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "org.au", "net.au", "co.jp"];
  const last3 = labels.slice(-3).join(".");
  if (publicSuffix3Labels.includes(last3)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
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

function inferPatternFromPublicEmails(emails: string[], domain: string): "first.last" | "flast" | null {
  const root = rootDomainOnly(domain);
  const locals = emails
    .map(e => e.toLowerCase())
    .filter(e => e.endsWith(`@${root}`))
    .map(e => e.split("@")[0] ?? "")
    .filter(Boolean);
  if (locals.length === 0) return null;
  const dotCount = locals.filter(l => l.includes(".")).length;
  if (dotCount / locals.length >= 0.6) return "first.last";
  const shortCount = locals.filter(l => l.length <= 8).length;
  if (shortCount / locals.length >= 0.6) return "flast";
  return null;
}

function splitName(fullName: string | null): { first: string | null; last: string | null } {
  const s = (fullName ?? "").trim();
  if (!s) return { first: null, last: null };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };
  return { first: parts[0] ?? null, last: parts[parts.length - 1] ?? null };
}

function guessEmailsFromName(input: {
  first: string | null;
  last: string | null;
  domain: string;
  patternHint: "first.last" | "flast" | null;
}): Array<{ email: string; confidence: number; reason: string }> {
  const root = rootDomainOnly(input.domain);
  const f = (input.first ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const l = (input.last ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!f && !l) return [];

  const out: Array<{ email: string; confidence: number; reason: string }> = [];
  const push = (local: string, confidence: number, reason: string) => {
    if (!local) return;
    out.push({ email: `${local}@${root}`, confidence, reason });
  };

  if (input.patternHint === "first.last") push(`${f}.${l}`, 0.74, "pattern_inferred:first.last");
  if (input.patternHint === "flast") push(`${f.slice(0, 1)}${l}`, 0.72, "pattern_inferred:flast");

  push(`${f}.${l}`, 0.60, "common:first.last");
  push(`${f}${l}`, 0.56, "common:firstlast");
  push(`${f.slice(0, 1)}${l}`, 0.54, "common:flast");
  push(`${f}${l.slice(0, 1)}`, 0.52, "common:firstl");
  push(`${f}`, 0.45, "common:first");

  const dedup = new Map<string, { email: string; confidence: number; reason: string }>();
  for (const e of out) {
    const prev = dedup.get(e.email);
    if (!prev || e.confidence > prev.confidence) dedup.set(e.email, e);
  }
  return Array.from(dedup.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 4);
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

  const titleRe = new RegExp(`\\b${escapeRegExp(titleNeedle)}\\b`, "i");
  const countryRe = countryNeedle ? new RegExp(`\\b${escapeRegExp(countryNeedle)}\\b`, "i") : null;

  const out: Array<{ fullName: string; matchedTitle: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";
    if (!titleRe.test(line)) continue;
    if (countryRe && !countryRe.test(line)) {
      // allow if country isn't in the same line; we’ll keep it simple and not enforce.
    }

    const window = [rawLines[i - 1], rawLines[i], rawLines[i + 1]].filter(Boolean).join(" ");
    const name = guessNameFromSnippet(window);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fullName: name, matchedTitle: titleNeedle });
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
    const industryOk = !industryNeedle || hay.includes(industryNeedle);
    const countryOk = !countryNeedle || hay.includes(countryNeedle);
    if (!industryOk && !countryOk) continue;

    seen.add(key);
    out.push(company);
    if (out.length >= input.maxCompanies) break;
  }
  return out;
}

async function runV1(input: RunInput, runId: string) {
  const startedAt = Date.now();
  let companies = input.companies.map(normalizeCompanyName).filter(Boolean);

  setRun(runId, {
    organizationId: input.organizationId,
    runId,
    state: "running",
    step: "seeding_companies",
    progress: { companiesTotal: Math.min(input.maxCompanies, companies.length || input.maxCompanies), companiesDone: 0 },
    startedAt,
  });

  if (companies.length === 0) companies = await seedCompaniesFromSignals(input);
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
  let companiesDone = 0;

  for (const company of companies) {
    const resolved = await resolveCompanyDomainDeterministic({
      company,
      article_html: "",
      article_text: "",
    });
    const domain = resolved.domain;
    const root = domain ? rootDomainOnly(domain) : null;

    setRun(runId, {
      organizationId: input.organizationId,
      runId,
      state: "running",
      step: "crawling_sites",
      progress: { companiesTotal: companies.length, companiesDone },
      startedAt,
    });

    const urls: string[] = [];
    if (root) {
      const base = `https://${root}`;
      urls.push(
        `${base}/`,
        `${base}/about`,
        `${base}/team`,
        `${base}/leadership`,
        `${base}/company`,
        `${base}/contact`,
        `${base}/press`,
      );
    }

    const publicEmails = new Set<string>();
    let patternHint: "first.last" | "flast" | null = null;

    for (const url of urls) {
      const html = await fetchText(url, 12_000);
      if (!html) continue;
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
    stats: { companiesProcessed: companies.length, candidatesFound: items.length },
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

  const selected = status.result.items.filter(i => input.candidateIds.includes(i.id));
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

