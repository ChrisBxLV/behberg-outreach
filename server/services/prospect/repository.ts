// DB upsert helpers for the prospect database. All upserts are idempotent and
// dedupe by domain, LinkedIn URL, or (companyId, fullName) depending on the
// available identity.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  prospectCompanies,
  prospectEmployees,
  prospectEmailPatterns,
  prospectCrawlQueue,
  type ProspectCompany,
  type ProspectEmployee,
  type InsertProspectCompany,
  type InsertProspectEmployee,
  type InsertProspectEmailPattern,
  type InsertProspectCrawlQueue,
} from "../../../drizzle/schema";
import { rootDomainOnly } from "../prospectingV1Utils";
import {
  isExcludedCompanyName,
  isExcludedDomain,
  normalizeCompanyName,
} from "./exclusions";
import type {
  CompanyDraft,
  EmployeeDraft,
  ProspectSource,
  QueueJobDraft,
  SeniorityLevel,
} from "./types";

/** "C-level" titles. */
const TITLE_C_LEVEL = /\b(c[a-z]o|chief\s+\w+\s+officer|founder|co[\s-]?founder|owner|partner|managing\s+partner|managing\s+director)\b/i;
/** "Head of …" / VP-level. */
const TITLE_HEAD = /\b(head\s+of|vp|vice\s+president|svp|evp|avp|chief\s+of\s+staff)\b/i;
const TITLE_DIRECTOR = /\b(director)\b/i;
const TITLE_MANAGER = /\b(manager|lead|principal)\b/i;

export function inferSeniority(title: string | null | undefined): SeniorityLevel {
  if (!title) return "unknown";
  if (TITLE_C_LEVEL.test(title)) return "c_level";
  if (TITLE_HEAD.test(title)) return "head";
  if (TITLE_DIRECTOR.test(title)) return "director";
  if (TITLE_MANAGER.test(title)) return "manager";
  return "ic";
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!trimmed) return null;
  return rootDomainOnly(trimmed.replace(/^www\./i, ""));
}

export type UpsertCompanyResult = {
  company: ProspectCompany;
  created: boolean;
};

/**
 * Upsert a company by domain (preferred), LinkedIn URL, or normalized name. The
 * caller is responsible for not passing draft sources flagged as excluded; we
 * still tag obvious "Self-employed"/"Stealth" placeholders so future ingests
 * can dedupe against them and skip enrichment.
 */
export async function upsertCompany(draft: CompanyDraft): Promise<UpsertCompanyResult | null> {
  const db = await getDb();
  if (!db) return null;

  const trimmedName = draft.name.trim().replace(/\s+/g, " ");
  if (!trimmedName) return null;
  const nameNormalized = normalizeCompanyName(trimmedName);
  if (!nameNormalized) return null;

  const excluded = isExcludedCompanyName(trimmedName);
  const domain = normalizeDomain(draft.domain ?? null);
  if (domain && isExcludedDomain(domain)) {
    // Domain belongs to a free-mail provider or social network — never store it as a company.
    return null;
  }

  const linkedinUrl = sanitizeLinkedinCompanyUrl(draft.linkedinUrl ?? null);

  // Try lookup by domain, then linkedinUrl, then nameNormalized.
  let existing = await findCompany({ domain, linkedinUrl, nameNormalized });

  if (existing) {
    const merged = mergeCompanyFields(existing, draft, {
      domain,
      linkedinUrl,
      nameNormalized,
      excluded,
    });
    if (merged.changed) {
      await db
        .update(prospectCompanies)
        .set({ ...merged.set, lastEnrichedAt: new Date() })
        .where(eq(prospectCompanies.id, existing.id));
    }
    const refreshed = await getCompanyById(existing.id);
    return refreshed ? { company: refreshed, created: false } : null;
  }

  const insert: InsertProspectCompany = {
    name: trimmedName,
    nameNormalized,
    domain: domain ?? null,
    hqCountry: draft.hqCountry ?? null,
    hqAdmin1: draft.hqAdmin1 ?? null,
    hqCity: draft.hqCity ?? null,
    headcount: draft.headcount ?? null,
    headcountBand: draft.headcountBand ?? null,
    industryCode: draft.industryCode ?? null,
    subIndustryCode: draft.subIndustryCode ?? null,
    linkedinUrl: linkedinUrl ?? null,
    websiteVerified: false,
    source: draft.source,
    sourceEvidenceUrl: draft.sourceEvidenceUrl ?? null,
    status: excluded ? "excluded_self_employed" : "active",
    lastEnrichedAt: new Date(),
  };
  try {
    const inserted = await db.insert(prospectCompanies).values(insert);
    const newId = Number((inserted as any)?.insertId ?? 0);
    if (newId > 0) {
      const fresh = await getCompanyById(newId);
      if (fresh) return { company: fresh, created: true };
    }
  } catch (err: any) {
    if (!isDuplicateKeyError(err)) {
      console.warn(`[ProspectRepo] upsertCompany insert failed:`, err?.message ?? err);
    }
  }

  // Race fallback: refetch.
  const fallback = await findCompany({ domain, linkedinUrl, nameNormalized });
  return fallback ? { company: fallback, created: false } : null;
}

async function findCompany(opts: {
  domain: string | null;
  linkedinUrl: string | null;
  nameNormalized: string;
}): Promise<ProspectCompany | null> {
  const db = await getDb();
  if (!db) return null;
  if (opts.domain) {
    const rows = await db
      .select()
      .from(prospectCompanies)
      .where(eq(prospectCompanies.domain, opts.domain));
    if (rows[0]) return rows[0];
  }
  if (opts.linkedinUrl) {
    const rows = await db
      .select()
      .from(prospectCompanies)
      .where(eq(prospectCompanies.linkedinUrl, opts.linkedinUrl));
    if (rows[0]) return rows[0];
  }
  const rows = await db
    .select()
    .from(prospectCompanies)
    .where(eq(prospectCompanies.nameNormalized, opts.nameNormalized));
  return rows[0] ?? null;
}

export async function getCompanyById(id: number): Promise<ProspectCompany | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(prospectCompanies).where(eq(prospectCompanies.id, id));
  return rows[0] ?? null;
}

function mergeCompanyFields(
  existing: ProspectCompany,
  draft: CompanyDraft,
  ctx: { domain: string | null; linkedinUrl: string | null; nameNormalized: string; excluded: boolean },
): { set: Partial<InsertProspectCompany>; changed: boolean } {
  const set: Partial<InsertProspectCompany> = {};
  let changed = false;

  function bump<K extends keyof InsertProspectCompany>(key: K, value: InsertProspectCompany[K]) {
    if (value == null || value === "") return;
    if ((existing as any)[key] != null && (existing as any)[key] !== "") return;
    (set as any)[key] = value;
    changed = true;
  }

  bump("domain", ctx.domain ?? null);
  bump("linkedinUrl", ctx.linkedinUrl ?? null);
  bump("hqCountry", draft.hqCountry ?? null);
  bump("hqAdmin1", draft.hqAdmin1 ?? null);
  bump("hqCity", draft.hqCity ?? null);
  bump("headcount", draft.headcount ?? null);
  bump("headcountBand", draft.headcountBand ?? null);
  bump("industryCode", draft.industryCode ?? null);
  bump("subIndustryCode", draft.subIndustryCode ?? null);
  bump("sourceEvidenceUrl", draft.sourceEvidenceUrl ?? null);

  if (ctx.excluded && existing.status !== "excluded_self_employed") {
    set.status = "excluded_self_employed";
    changed = true;
  }
  return { set, changed };
}

export async function markCompanyDomainVerified(id: number, domain: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(prospectCompanies)
    .set({ domain, websiteVerified: true, lastVerifiedAt: new Date() })
    .where(eq(prospectCompanies.id, id));
}

/* ------------------------------------------------------------------ */
/* Employees                                                          */
/* ------------------------------------------------------------------ */

export async function upsertEmployee(draft: EmployeeDraft): Promise<ProspectEmployee | null> {
  const db = await getDb();
  if (!db) return null;
  const fullName = draft.fullName.trim().replace(/\s+/g, " ");
  if (!fullName) return null;

  let companyId = draft.companyId ?? null;
  if (companyId == null) {
    const lookup = await resolveCompanyForDraft(draft);
    companyId = lookup?.id ?? null;
  }
  if (companyId == null) return null;

  const linkedinUrl = sanitizeLinkedinPersonUrl(draft.linkedinUrl ?? null);
  const seniority = draft.seniorityLevel ?? inferSeniority(draft.title ?? null);
  const emailHint = normalizeEmailForDedupe(draft.emailHint ?? null);

  // Look up by linkedinUrl first, then by email, then by (companyId, fullName).
  // Email is a strong identity signal even when LinkedIn URL is missing — many
  // CSV imports don't carry LinkedIn URLs but always carry an email address.
  let existing: ProspectEmployee | null = null;
  if (linkedinUrl) {
    const rows = await db
      .select()
      .from(prospectEmployees)
      .where(eq(prospectEmployees.linkedinUrl, linkedinUrl));
    existing = rows[0] ?? null;
  }
  if (!existing && emailHint) {
    const rows = await db
      .select()
      .from(prospectEmployees)
      .where(eq(prospectEmployees.email, emailHint));
    existing = rows[0] ?? null;
  }
  if (!existing) {
    const rows = await db
      .select()
      .from(prospectEmployees)
      .where(and(eq(prospectEmployees.companyId, companyId), eq(prospectEmployees.fullName, fullName)));
    existing = rows[0] ?? null;
  }

  if (existing) {
    const updates: Partial<InsertProspectEmployee> = {};
    let changed = false;
    function bump<K extends keyof InsertProspectEmployee>(key: K, value: InsertProspectEmployee[K]) {
      if (value == null || value === "") return;
      if ((existing as any)[key] != null && (existing as any)[key] !== "") return;
      (updates as any)[key] = value;
      changed = true;
    }
    bump("title", draft.title ?? null);
    bump("titleNormalized", normalizeTitle(draft.title ?? null));
    bump("firstName", draft.firstName ?? null);
    bump("lastName", draft.lastName ?? null);
    bump("locationCountry", draft.locationCountry ?? null);
    bump("locationAdmin1", draft.locationAdmin1 ?? null);
    bump("locationCity", draft.locationCity ?? null);
    bump("linkedinUrl", linkedinUrl ?? null);
    bump("sourceEvidenceUrl", draft.sourceEvidenceUrl ?? null);
    if (emailHint && !existing.email) {
      updates.email = emailHint;
      // CSV imports come with a real email even though we haven't proven MX yet.
      // Mark as mx_present only when caller passes verified=true, otherwise keep unknown.
      if (draft.emailHintVerified === true) updates.emailStatus = "mx_present";
      changed = true;
    }
    if (existing.seniorityLevel === "unknown" && seniority !== "unknown") {
      updates.seniorityLevel = seniority;
      changed = true;
    }
    if (changed) {
      await db
        .update(prospectEmployees)
        .set(updates)
        .where(eq(prospectEmployees.id, existing.id));
    }
    const rows = await db
      .select()
      .from(prospectEmployees)
      .where(eq(prospectEmployees.id, existing.id));
    return rows[0] ?? existing;
  }

  const split = splitFullName(fullName, draft.firstName ?? null, draft.lastName ?? null);
  const insert: InsertProspectEmployee = {
    companyId,
    firstName: draft.firstName ?? split.first,
    lastName: draft.lastName ?? split.last,
    fullName,
    title: draft.title ?? null,
    titleNormalized: normalizeTitle(draft.title ?? null),
    seniorityLevel: seniority,
    locationCountry: draft.locationCountry ?? null,
    locationAdmin1: draft.locationAdmin1 ?? null,
    locationCity: draft.locationCity ?? null,
    linkedinUrl: linkedinUrl ?? null,
    email: emailHint ?? null,
    emailStatus: emailHint && draft.emailHintVerified === true ? "mx_present" : "unknown",
    source: draft.source,
    sourceEvidenceUrl: draft.sourceEvidenceUrl ?? null,
  };
  try {
    const inserted = await db.insert(prospectEmployees).values(insert);
    const newId = Number((inserted as any)?.insertId ?? 0);
    if (newId > 0) {
      const rows = await db
        .select()
        .from(prospectEmployees)
        .where(eq(prospectEmployees.id, newId));
      return rows[0] ?? null;
    }
  } catch (err: any) {
    if (!isDuplicateKeyError(err)) {
      console.warn(`[ProspectRepo] upsertEmployee insert failed:`, err?.message ?? err);
    }
  }
  // Race fallback.
  const rows = await db
    .select()
    .from(prospectEmployees)
    .where(and(eq(prospectEmployees.companyId, companyId), eq(prospectEmployees.fullName, fullName)));
  return rows[0] ?? null;
}

export async function setEmployeeEmail(
  employeeId: number,
  fields: {
    email: string | null;
    emailPattern: string | null;
    emailStatus: "unknown" | "mx_present" | "mx_absent" | "excluded";
    emailGuesses: string[];
  },
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(prospectEmployees)
    .set({
      email: fields.email,
      emailPattern: fields.emailPattern,
      emailStatus: fields.emailStatus,
      emailGuesses: fields.emailGuesses,
      lastVerifiedAt: new Date(),
    })
    .where(eq(prospectEmployees.id, employeeId));
}

async function resolveCompanyForDraft(draft: EmployeeDraft): Promise<ProspectCompany | null> {
  const domain = normalizeDomain(draft.companyDomainHint ?? null);
  const linkedin = sanitizeLinkedinCompanyUrl(null);
  const name = draft.companyNameHint ?? "";
  const nameNormalized = name ? normalizeCompanyName(name) : "";
  return findCompany({ domain, linkedinUrl: linkedin, nameNormalized });
}

/* ------------------------------------------------------------------ */
/* Email patterns                                                     */
/* ------------------------------------------------------------------ */

export async function bumpEmailPattern(companyId: number, pattern: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const insert: InsertProspectEmailPattern = {
    companyId,
    pattern,
    observedCount: 1,
  };
  await db
    .insert(prospectEmailPatterns)
    .values(insert)
    .onDuplicateKeyUpdate({
      set: {
        observedCount: sql`${prospectEmailPatterns.observedCount} + 1`,
      },
    });
}

export async function getTopEmailPattern(companyId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(prospectEmailPatterns)
    .where(eq(prospectEmailPatterns.companyId, companyId));
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.observedCount - a.observedCount);
  return rows[0]?.pattern ?? null;
}

/* ------------------------------------------------------------------ */
/* Crawl queue                                                        */
/* ------------------------------------------------------------------ */

export async function enqueueJobs(jobs: QueueJobDraft[]): Promise<void> {
  if (jobs.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const rows: InsertProspectCrawlQueue[] = jobs.map(j => ({
    kind: j.kind,
    payload: j.payload,
    priority: j.priority ?? 0,
    availableAt: j.availableAt ?? new Date(),
    status: "pending",
  }));
  for (const chunk of chunk(rows, 50)) {
    try {
      await db.insert(prospectCrawlQueue).values(chunk);
    } catch (err: any) {
      console.warn(`[ProspectRepo] enqueueJobs failed:`, err?.message ?? err);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("ER_DUP_ENTRY") || msg.includes("Duplicate entry");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function sanitizeLinkedinCompanyUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    if (!/^\/company\//i.test(u.pathname)) return null;
    u.hash = "";
    u.search = "";
    const slug = u.pathname.replace(/^\/company\//i, "").split("/")[0]?.toLowerCase() ?? "";
    if (!slug) return null;
    return `https://www.linkedin.com/company/${slug}`;
  } catch {
    return null;
  }
}

export function sanitizeLinkedinPersonUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    if (!/^\/in\//i.test(u.pathname)) return null;
    u.hash = "";
    u.search = "";
    const slug = u.pathname.replace(/^\/in\//i, "").split("/")[0]?.toLowerCase() ?? "";
    if (!slug) return null;
    return `https://www.linkedin.com/in/${slug}`;
  } catch {
    return null;
  }
}

function splitFullName(
  fullName: string,
  givenFirst: string | null,
  givenLast: string | null,
): { first: string | null; last: string | null } {
  if (givenFirst || givenLast) {
    return { first: givenFirst ?? null, last: givenLast ?? null };
  }
  const parts = fullName.split(/\s+/g).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0]!, last: null };
  return { first: parts[0]!, last: parts[parts.length - 1]! };
}

function normalizeTitle(title: string | null): string | null {
  if (!title) return null;
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeEmailForDedupe(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export type { ProspectSource };
