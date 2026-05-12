// Per-company website crawler.
//
// Fetches /, /about, /team, … via `safeFetch`. Extracts:
//   - <title>, meta description, og:site_name -> industry classifier.
//   - mailto: on the company domain -> `prospect_email_patterns` (skipped in
//     `company_safe` to avoid feeding personal-email guessing).
//   - Named people on leadership-style blocks -> `prospect_employees` only in
//     `business_contacts` mode, with `sourceEvidenceUrl` and `sourceConfidence`.

import { safeFetch } from "./safeFetch";
import { classifyIndustry } from "./industryClassifier";
import {
  bumpEmailPattern,
  getCompanyById,
  upsertEmployee,
  inferSeniority,
} from "./repository";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectCompanies } from "../../../drizzle/schema";
import { getProspectCrawlerRuntimeSettings } from "./crawlerSettings";

const PATHS = ["/", "/about", "/about-us", "/team", "/people", "/leadership", "/our-team", "/contact", "/company"];

const ROLE_HINTS = [
  "ceo",
  "chief executive",
  "cto",
  "chief technology",
  "cfo",
  "chief financial",
  "coo",
  "chief operating",
  "cmo",
  "chief marketing",
  "cpo",
  "chief product",
  "founder",
  "co-founder",
  "cofounder",
  "managing partner",
  "managing director",
  "head of",
  "vice president",
  " vp ",
  "president",
  "director of",
];

/** Heuristic 0–1 score for a website-extracted person line. */
function websitePersonExtractionConfidence(title: string | null): number {
  const t = (title ?? "").toLowerCase();
  const strong =
    /\b(ceo|cto|cfo|coo|cmo|cpo|chief|founder|co-founder|president|managing director)\b/.test(t);
  return strong ? 0.82 : 0.68;
}

export async function crawlCompanyWebsite(companyId: number): Promise<void> {
  const company = await getCompanyById(companyId);
  if (!company || !company.domain || company.status !== "active") return;
  const db = await getDb();
  if (!db) return;

  const rt = await getProspectCrawlerRuntimeSettings();
  const dataMode = rt.dataMode;

  const aggregateMeta: string[] = [];
  let aggregateTitle: string | null = null;

  for (const path of PATHS) {
    const url = `https://${company.domain}${path}`;
    const res = await safeFetch(url);
    if (!res || !res.body) continue;
    if (!res.contentType.includes("text/html") && !res.contentType.includes("application/xhtml")) continue;

    const title = extractTitle(res.body);
    if (title && !aggregateTitle) aggregateTitle = title;
    const meta = extractMetaDescription(res.body);
    if (meta) aggregateMeta.push(meta);

    if (dataMode !== "company_safe") {
      const mailtos = extractMailtoAddresses(res.body, company.domain);
      for (const addr of mailtos) {
        const pattern = inferEmailPattern(addr.local);
        if (pattern) await bumpEmailPattern(companyId, pattern);
      }
    }

    if (dataMode === "business_contacts") {
      const candidates = extractEmployeeCandidates(res.body);
      for (const cand of candidates) {
        const confidence = websitePersonExtractionConfidence(cand.title);
        await upsertEmployee({
          companyId,
          companyDomainHint: company.domain,
          companyNameHint: company.name,
          fullName: cand.name,
          title: cand.title,
          seniorityLevel: inferSeniority(cand.title),
          source: "website",
          sourceEvidenceUrl: url,
          sourceConfidence: confidence,
        });
      }
    }
  }

  const classification = classifyIndustry({
    name: company.name,
    websiteTitle: aggregateTitle ?? undefined,
    websiteMeta: aggregateMeta.join(" "),
  });
  if (classification.code && (!company.industryCode || company.industryCode !== classification.code)) {
    await db
      .update(prospectCompanies)
      .set({
        industryCode: classification.code,
        subIndustryCode: classification.subCode ?? null,
        websiteVerified: true,
        lastEnrichedAt: new Date(),
      })
      .where(eq(prospectCompanies.id, companyId));
  } else {
    await db
      .update(prospectCompanies)
      .set({ websiteVerified: true, lastEnrichedAt: new Date() })
      .where(eq(prospectCompanies.id, companyId));
  }
}

/* ------------------------------------------------------------------ */
/* Extraction helpers                                                 */
/* ------------------------------------------------------------------ */

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,512}?)<\/title>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{0,512})["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']{0,512})["'][^>]*name=["']description["'][^>]*>/i) ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']{0,512})["'][^>]*>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function extractMailtoAddresses(html: string, expectedDomain: string): Array<{ email: string; local: string }> {
  const out = new Map<string, { email: string; local: string }>();
  const re = /mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const email = (m[1] ?? "").toLowerCase();
    if (!email) continue;
    const at = email.indexOf("@");
    if (at <= 0) continue;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (!domain.endsWith(expectedDomain.toLowerCase())) continue;
    if (!out.has(email)) out.set(email, { email, local });
  }
  return Array.from(out.values()).slice(0, 12);
}

/**
 * Returns the *pattern* a local part appears to follow. Patterns mirror the
 * email waterfall list so we can promote learned patterns to the top.
 */
export function inferEmailPattern(local: string): string | null {
  const l = local.toLowerCase();
  if (!l || l.length > 64) return null;
  if (/^(info|contact|hello|sales|support|admin|hr|jobs|careers|press|noreply|no-reply|legal)$/.test(l)) {
    return null;
  }
  if (/^[a-z]+\.[a-z]+$/.test(l)) return "first.last";
  if (/^[a-z]+_[a-z]+$/.test(l)) return "first_last";
  if (/^[a-z]+-[a-z]+$/.test(l)) return "first-last";
  if (/^[a-z]\.[a-z]+$/.test(l)) return "f.last";
  if (/^[a-z]+\.[a-z]$/.test(l)) return "first.l";
  if (/^[a-z][a-z]+$/.test(l) && l.length <= 12) {
    return "flast";
  }
  return null;
}

function extractEmployeeCandidates(html: string): Array<{ name: string; title: string | null }> {
  const candidates: Array<{ name: string; title: string | null }> = [];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const blockRe = /<(?:h[1-4]|p|li|div)[^>]*>([\s\S]{1,400}?)<\/(?:h[1-4]|p|li|div)>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    const inner = (m[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!inner) continue;
    if (inner.length > 220) continue;
    const lower = inner.toLowerCase();
    const matchedRole = ROLE_HINTS.find(r => lower.includes(r));
    if (!matchedRole) continue;
    const split = inner.split(/[•|·,-]| – | — /).map(s => s.trim()).filter(Boolean);
    if (split.length < 2) continue;
    const name = split[0];
    const title = split.slice(1).join(" - ");
    if (!name || name.split(/\s+/g).length < 2) continue;
    if (!/^[A-Z][a-zA-Z'\-\.]+(?:\s+[A-Z][a-zA-Z'\-\.]+){1,3}$/.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name, title });
    if (candidates.length >= 10) break;
  }
  return candidates;
}
