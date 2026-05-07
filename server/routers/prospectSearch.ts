// tRPC router that exposes the autonomous prospect database.
//
// The crawler grows the database in the background; this router lets the UI
// query it and link prospects to per-org `contacts`. Every tenant sees the
// same global catalogue (the prospect DB is shared across orgs); per-org CRM
// data continues to live in the `contacts` table. Search results carry an
// `inMyContacts` flag that surfaces overlap with the caller's org so users
// don't import the same person twice.

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { protectedProcedure, router } from "../_core/trpc";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { createOrMergeContact, getDb } from "../db";
import {
  contacts,
  industries,
  prospectCompanies,
  prospectCrawlQueue,
  prospectCrawlRuns,
  prospectCrawlSeeds,
  prospectDailyBudget,
  prospectEmployees,
} from "../../drizzle/schema";
import { seedProspectDb } from "../services/prospect/seedProspectDb";
import { enqueueJobs, normalizeDomain, upsertCompany } from "../services/prospect/repository";
import { tickQueueCompany, tickQueueEmployee, tickSeeds } from "../services/prospect/crawler";

const COMPANY_LIMIT = 50;
const EMPLOYEE_LIMIT = 50;

const HEADCOUNT_BANDS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1k",
  "1k-5k",
  "5k-10k",
  "10k+",
] as const;

const SENIORITY_LEVELS = ["c_level", "head", "director", "manager", "ic", "unknown"] as const;
const PROSPECT_SOURCES = [
  "wikidata",
  "sec_edgar",
  "uk_ch",
  "linkedin_serp",
  "website",
  "user_import",
  "unknown",
] as const;
const COMPANY_SORTS = ["recent", "name_asc", "name_desc", "headcount_desc", "headcount_asc"] as const;
const EMPLOYEE_SORTS = ["recent", "name_asc", "seniority", "with_email_first"] as const;
const EMAIL_FILTERS = ["any", "with_email", "without_email", "mx_absent"] as const;

function emptyPlatformOverview() {
  return {
    totals: {
      companies: 0,
      companiesActive: 0,
      companiesWithDomain: 0,
      companiesVerified: 0,
      companiesWithLinkedin: 0,
      employees: 0,
      employeesWithEmail: 0,
      employeesWithLinkedin: 0,
    },
    bySource: { companies: [] as Array<{ source: string | null; count: number }>, employees: [] as Array<{ source: string | null; count: number }> },
    byCountry: [] as Array<{ country: string | null; count: number }>,
    byIndustry: [] as Array<{ industryCode: string | null; count: number }>,
    bySeniority: [] as Array<{ level: string | null; count: number }>,
    byHeadcountBand: [] as Array<{ band: string | null; count: number }>,
    growth: {
      companies: [] as Array<{ day: string; count: number }>,
      employees: [] as Array<{ day: string; count: number }>,
    },
    queue: {
      byStatus: [] as Array<{ status: string | null; count: number }>,
      byKind: [] as Array<{ kind: string | null; status: string | null; count: number }>,
    },
    recentRuns: [] as Array<unknown>,
    seedHealth: [] as Array<unknown>,
    budget: [] as Array<unknown>,
  };
}

async function hasProspectSchema(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    // Prefer direct probes over information_schema: some managed MySQL setups
    // restrict metadata visibility but allow querying the actual app tables.
    await Promise.all([
      db.select({ n: sql<number>`1` }).from(prospectCrawlSeeds).limit(1),
      db.select({ n: sql<number>`1` }).from(prospectCrawlQueue).limit(1),
      db.select({ n: sql<number>`1` }).from(prospectCompanies).limit(1),
      db.select({ n: sql<number>`1` }).from(prospectEmployees).limit(1),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Lowercase + trim the linkedin URL exactly the same way we store it. */
function normalizeLinkedin(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim().toLowerCase();
  return t || null;
}
function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

type ContactMatch = { email: string | null; linkedinUrl: string | null; fullName: string | null; company: string | null };

/**
 * For a list of prospect employees, fetch the matching contacts in this org and
 * return a Map<prospectEmployeeId, contactId> so the UI can show "in your CRM".
 */
async function buildEmployeeContactOverlap(
  organizationId: number,
  employees: Array<{ id: number; email: string | null; linkedinUrl: string | null; fullName: string; companyName: string | null }>,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!employees.length) return out;
  const db = await getDb();
  if (!db) return out;

  const emails = Array.from(
    new Set(
      employees
        .map(e => normalizeEmail(e.email))
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const linkedins = Array.from(
    new Set(
      employees
        .map(e => normalizeLinkedin(e.linkedinUrl))
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const names = Array.from(
    new Set(
      employees
        .map(e => e.fullName.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const conditions = [];
  if (emails.length) conditions.push(sql`LOWER(${contacts.email}) IN (${sql.join(emails.map(v => sql`${v}`), sql`, `)})`);
  if (linkedins.length) conditions.push(sql`LOWER(${contacts.linkedinUrl}) IN (${sql.join(linkedins.map(v => sql`${v}`), sql`, `)})`);
  if (names.length) conditions.push(sql`LOWER(${contacts.fullName}) IN (${sql.join(names.map(v => sql`${v}`), sql`, `)})`);
  if (conditions.length === 0) return out;

  const rows = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      linkedinUrl: contacts.linkedinUrl,
      fullName: contacts.fullName,
      company: contacts.company,
    })
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), or(...conditions)!));

  const byEmail = new Map<string, ContactMatch & { id: number }>();
  const byLinkedin = new Map<string, ContactMatch & { id: number }>();
  const byNameCompany = new Map<string, ContactMatch & { id: number }>();
  for (const r of rows) {
    const e = normalizeEmail(r.email);
    if (e) byEmail.set(e, { id: r.id, email: e, linkedinUrl: r.linkedinUrl ?? null, fullName: r.fullName ?? null, company: r.company ?? null });
    const li = normalizeLinkedin(r.linkedinUrl);
    if (li) byLinkedin.set(li, { id: r.id, email: r.email ?? null, linkedinUrl: li, fullName: r.fullName ?? null, company: r.company ?? null });
    const nm = (r.fullName ?? "").trim().toLowerCase();
    if (nm) {
      const key = `${nm}|${(r.company ?? "").trim().toLowerCase()}`;
      byNameCompany.set(key, { id: r.id, email: r.email ?? null, linkedinUrl: r.linkedinUrl ?? null, fullName: nm, company: r.company ?? null });
    }
  }

  for (const emp of employees) {
    const e = normalizeEmail(emp.email);
    if (e && byEmail.has(e)) {
      out.set(emp.id, byEmail.get(e)!.id);
      continue;
    }
    const li = normalizeLinkedin(emp.linkedinUrl);
    if (li && byLinkedin.has(li)) {
      out.set(emp.id, byLinkedin.get(li)!.id);
      continue;
    }
    const nm = emp.fullName.trim().toLowerCase();
    const c = (emp.companyName ?? "").trim().toLowerCase();
    // Only match on (name + company) when both are present and the name has
    // at least two tokens — avoids common-name false positives like "John Smith".
    if (nm && c && nm.split(/\s+/g).length >= 2) {
      const key = `${nm}|${c}`;
      if (byNameCompany.has(key)) {
        out.set(emp.id, byNameCompany.get(key)!.id);
      }
    }
  }
  return out;
}

/** For a list of companies, return Map<companyId, count of contacts in this org that match the company> */
async function buildCompanyContactOverlap(
  organizationId: number,
  companies: Array<{ id: number; name: string; domain: string | null }>,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!companies.length) return out;
  const db = await getDb();
  if (!db) return out;
  const domains = Array.from(
    new Set(
      companies
        .map(c => c.domain?.toLowerCase().trim())
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const names = Array.from(new Set(companies.map(c => c.name.trim().toLowerCase()).filter(Boolean)));

  const conditions = [];
  if (domains.length) conditions.push(sql`LOWER(${contacts.normalizedDomain}) IN (${sql.join(domains.map(v => sql`${v}`), sql`, `)})`);
  if (names.length) conditions.push(sql`LOWER(${contacts.company}) IN (${sql.join(names.map(v => sql`${v}`), sql`, `)})`);
  if (conditions.length === 0) return out;

  const rows = await db
    .select({
      domain: contacts.normalizedDomain,
      company: contacts.company,
      count: sql<number>`COUNT(*)`,
    })
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), or(...conditions)!))
    .groupBy(contacts.normalizedDomain, contacts.company);

  for (const c of companies) {
    let cnt = 0;
    const d = c.domain?.toLowerCase().trim() ?? null;
    const n = c.name.trim().toLowerCase();
    for (const r of rows) {
      const rd = r.domain?.toLowerCase().trim() ?? null;
      const rn = r.company?.trim().toLowerCase() ?? null;
      if (d && rd && d === rd) cnt += Number(r.count);
      else if (n && rn && n === rn) cnt += Number(r.count);
    }
    if (cnt > 0) out.set(c.id, cnt);
  }
  return out;
}

export const prospectSearchRouter = router({
  industries: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(industries).orderBy(asc(industries.label));
    return rows;
  }),

  /**
   * Companies search.
   * Supports multi-select filters, boolean toggles, and sort options. Returns
   * each row with `inMyContactsCount` so the UI can flag companies already on
   * the org's contact list.
   */
  companies: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().max(120).optional(),
        countries: z.array(z.string().trim().length(2)).max(50).optional(),
        admin1s: z.array(z.string().trim().max(8)).max(50).optional(),
        cityContains: z.string().trim().max(120).optional(),
        industryCodes: z.array(z.string().trim().max(64)).max(40).optional(),
        headcountBands: z.array(z.enum(HEADCOUNT_BANDS)).max(8).optional(),
        sources: z.array(z.enum(PROSPECT_SOURCES)).max(7).optional(),
        hasDomainOnly: z.boolean().optional(),
        verifiedDomainOnly: z.boolean().optional(),
        hasLinkedinOnly: z.boolean().optional(),
        hasEmployeesOnly: z.boolean().optional(),
        hasEmailsOnly: z.boolean().optional(),
        excludeMyContacts: z.boolean().optional(),
        sortBy: z.enum(COMPANY_SORTS).optional(),
        cursor: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(COMPANY_LIMIT).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const db = await getDb();
      if (!db) return { items: [], nextCursor: null as number | null };

      const conditions = [eq(prospectCompanies.status, "active")];
      if (input.q) {
        const trimmed = input.q.trim();
        if (trimmed.length >= 4) {
          conditions.push(sql`MATCH(${prospectCompanies.name}) AGAINST (${trimmed} IN NATURAL LANGUAGE MODE)`);
        } else {
          conditions.push(like(prospectCompanies.name, `%${trimmed}%`));
        }
      }
      if (input.countries?.length) {
        conditions.push(inArray(prospectCompanies.hqCountry, input.countries.map(c => c.toUpperCase())));
      }
      if (input.admin1s?.length) {
        conditions.push(inArray(prospectCompanies.hqAdmin1, input.admin1s.map(a => a.toUpperCase())));
      }
      if (input.cityContains) conditions.push(like(prospectCompanies.hqCity, `%${input.cityContains}%`));
      if (input.industryCodes?.length) {
        conditions.push(
          or(
            inArray(prospectCompanies.industryCode, input.industryCodes),
            inArray(prospectCompanies.subIndustryCode, input.industryCodes),
          )!,
        );
      }
      if (input.headcountBands?.length) {
        conditions.push(inArray(prospectCompanies.headcountBand, input.headcountBands));
      }
      if (input.sources?.length) conditions.push(inArray(prospectCompanies.source, input.sources));
      if (input.hasDomainOnly) conditions.push(isNotNull(prospectCompanies.domain));
      if (input.verifiedDomainOnly) {
        conditions.push(isNotNull(prospectCompanies.domain));
        conditions.push(eq(prospectCompanies.websiteVerified, true));
      }
      if (input.hasLinkedinOnly) conditions.push(isNotNull(prospectCompanies.linkedinUrl));
      if (input.hasEmployeesOnly) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM ${prospectEmployees} WHERE ${prospectEmployees.companyId} = ${prospectCompanies.id})`,
        );
      }
      if (input.hasEmailsOnly) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM ${prospectEmployees} WHERE ${prospectEmployees.companyId} = ${prospectCompanies.id} AND ${prospectEmployees.emailStatus} = 'mx_present')`,
        );
      }
      if (input.excludeMyContacts) {
        // Keep only companies that don't appear (by domain or by company name) in this org's contacts.
        conditions.push(
          sql`NOT EXISTS (SELECT 1 FROM ${contacts} c WHERE c.organizationId = ${orgId} AND (
            (${prospectCompanies.domain} IS NOT NULL AND LOWER(c.normalizedDomain) = LOWER(${prospectCompanies.domain}))
            OR (LOWER(c.company) = LOWER(${prospectCompanies.name}))
          ))`,
        );
      }

      const limit = Math.min(input.limit ?? 25, COMPANY_LIMIT);
      const offset = input.cursor ?? 0;

      const order = (() => {
        switch (input.sortBy ?? "recent") {
          case "name_asc":
            return [asc(prospectCompanies.name), desc(prospectCompanies.id)];
          case "name_desc":
            return [desc(prospectCompanies.name), desc(prospectCompanies.id)];
          case "headcount_desc":
            return [desc(prospectCompanies.headcount), desc(prospectCompanies.id)];
          case "headcount_asc":
            return [asc(prospectCompanies.headcount), desc(prospectCompanies.id)];
          case "recent":
          default:
            return [desc(prospectCompanies.lastEnrichedAt), desc(prospectCompanies.id)];
        }
      })();

      const rows = await db
        .select()
        .from(prospectCompanies)
        .where(and(...conditions))
        .orderBy(...order)
        .limit(limit + 1)
        .offset(offset);

      const items = rows.slice(0, limit);
      const overlap = await buildCompanyContactOverlap(orgId, items.map(c => ({ id: c.id, name: c.name, domain: c.domain })));
      const enriched = items.map(c => ({ ...c, inMyContactsCount: overlap.get(c.id) ?? 0 }));
      const nextCursor = rows.length > limit ? offset + limit : null;
      return { items: enriched, nextCursor };
    }),

  employees: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().max(120).optional(),
        companyId: z.number().int().positive().optional(),
        countries: z.array(z.string().trim().length(2)).max(50).optional(),
        seniorityLevels: z.array(z.enum(SENIORITY_LEVELS)).max(6).optional(),
        titleContains: z.string().trim().max(120).optional(),
        sources: z.array(z.enum(PROSPECT_SOURCES)).max(7).optional(),
        emailFilter: z.enum(EMAIL_FILTERS).optional(),
        hasLinkedinOnly: z.boolean().optional(),
        hasTitleOnly: z.boolean().optional(),
        excludeMyContacts: z.boolean().optional(),
        sortBy: z.enum(EMPLOYEE_SORTS).optional(),
        cursor: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(EMPLOYEE_LIMIT).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const db = await getDb();
      if (!db) return { items: [], nextCursor: null as number | null };

      const conditions = [];
      if (input.q) {
        const trimmed = input.q.trim();
        if (trimmed.length >= 4) {
          conditions.push(
            sql`MATCH(${prospectEmployees.fullName}, ${prospectEmployees.title}) AGAINST (${trimmed} IN NATURAL LANGUAGE MODE)`,
          );
        } else {
          conditions.push(
            or(
              like(prospectEmployees.fullName, `%${trimmed}%`),
              like(prospectEmployees.title, `%${trimmed}%`),
            )!,
          );
        }
      }
      if (input.companyId) conditions.push(eq(prospectEmployees.companyId, input.companyId));
      if (input.countries?.length) {
        conditions.push(inArray(prospectEmployees.locationCountry, input.countries.map(c => c.toUpperCase())));
      }
      if (input.seniorityLevels?.length) {
        conditions.push(inArray(prospectEmployees.seniorityLevel, input.seniorityLevels));
      }
      if (input.titleContains) {
        conditions.push(like(prospectEmployees.titleNormalized, `%${input.titleContains.toLowerCase()}%`));
      }
      if (input.sources?.length) conditions.push(inArray(prospectEmployees.source, input.sources));
      switch (input.emailFilter) {
        case "with_email":
          conditions.push(eq(prospectEmployees.emailStatus, "mx_present"));
          break;
        case "without_email":
          conditions.push(eq(prospectEmployees.emailStatus, "unknown"));
          break;
        case "mx_absent":
          conditions.push(eq(prospectEmployees.emailStatus, "mx_absent"));
          break;
        case "any":
        default:
          break;
      }
      if (input.hasLinkedinOnly) conditions.push(isNotNull(prospectEmployees.linkedinUrl));
      if (input.hasTitleOnly) conditions.push(isNotNull(prospectEmployees.title));
      if (input.excludeMyContacts) {
        conditions.push(
          sql`NOT EXISTS (
            SELECT 1 FROM ${contacts} c
            LEFT JOIN ${prospectCompanies} pc ON pc.id = ${prospectEmployees.companyId}
            WHERE c.organizationId = ${orgId} AND (
              (${prospectEmployees.email} IS NOT NULL AND LOWER(c.email) = LOWER(${prospectEmployees.email}))
              OR (${prospectEmployees.linkedinUrl} IS NOT NULL AND LOWER(c.linkedinUrl) = LOWER(${prospectEmployees.linkedinUrl}))
              OR (
                LOWER(c.fullName) = LOWER(${prospectEmployees.fullName})
                AND LOWER(c.company) = LOWER(pc.name)
              )
            )
          )`,
        );
      }

      const limit = Math.min(input.limit ?? 25, EMPLOYEE_LIMIT);
      const offset = input.cursor ?? 0;

      const order = (() => {
        switch (input.sortBy ?? "recent") {
          case "name_asc":
            return [asc(prospectEmployees.fullName), desc(prospectEmployees.id)];
          case "seniority":
            return [
              sql`FIELD(${prospectEmployees.seniorityLevel}, 'c_level','head','director','manager','ic','unknown')`,
              desc(prospectEmployees.id),
            ];
          case "with_email_first":
            return [
              sql`CASE WHEN ${prospectEmployees.emailStatus} = 'mx_present' THEN 0 ELSE 1 END`,
              desc(prospectEmployees.lastVerifiedAt),
              desc(prospectEmployees.id),
            ];
          case "recent":
          default:
            return [desc(prospectEmployees.lastVerifiedAt), desc(prospectEmployees.id)];
        }
      })();

      const rows = await db
        .select({
          employee: prospectEmployees,
          company: prospectCompanies,
        })
        .from(prospectEmployees)
        .leftJoin(prospectCompanies, eq(prospectCompanies.id, prospectEmployees.companyId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(...order)
        .limit(limit + 1)
        .offset(offset);

      const sliced = rows.slice(0, limit);
      const overlap = await buildEmployeeContactOverlap(
        orgId,
        sliced.map(r => ({
          id: r.employee.id,
          email: r.employee.email,
          linkedinUrl: r.employee.linkedinUrl,
          fullName: r.employee.fullName,
          companyName: r.company?.name ?? null,
        })),
      );
      const items = sliced.map(r => ({
        ...r.employee,
        inMyContactsId: overlap.get(r.employee.id) ?? null,
        company: r.company
          ? {
              id: r.company.id,
              name: r.company.name,
              domain: r.company.domain,
              industryCode: r.company.industryCode,
              hqCountry: r.company.hqCountry,
            }
          : null,
      }));
      const nextCursor = rows.length > limit ? offset + limit : null;
      return { items, nextCursor };
    }),

  companyById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(prospectCompanies)
        .where(eq(prospectCompanies.id, input.id));
      return rows[0] ?? null;
    }),

  employeesByCompany: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({ employee: prospectEmployees, company: prospectCompanies })
        .from(prospectEmployees)
        .leftJoin(prospectCompanies, eq(prospectCompanies.id, prospectEmployees.companyId))
        .where(eq(prospectEmployees.companyId, input.companyId))
        .orderBy(
          sql`FIELD(${prospectEmployees.seniorityLevel}, 'c_level','head','director','manager','ic','unknown')`,
          asc(prospectEmployees.fullName),
        )
        .limit(input.limit);

      const overlap = await buildEmployeeContactOverlap(
        orgId,
        rows.map(r => ({
          id: r.employee.id,
          email: r.employee.email,
          linkedinUrl: r.employee.linkedinUrl,
          fullName: r.employee.fullName,
          companyName: r.company?.name ?? null,
        })),
      );
      return rows.map(r => ({
        ...r.employee,
        inMyContactsId: overlap.get(r.employee.id) ?? null,
      }));
    }),

  /**
   * Add one or more prospect employees to the caller's contacts. Uses
   * `createOrMergeContact`, so anyone already present is merged (no duplicates
   * created). Returns per-employee outcome.
   */
  addToContacts: protectedProcedure
    .input(z.object({ employeeIds: z.array(z.number().int().positive()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

      const rows = await db
        .select({ employee: prospectEmployees, company: prospectCompanies })
        .from(prospectEmployees)
        .leftJoin(prospectCompanies, eq(prospectCompanies.id, prospectEmployees.companyId))
        .where(inArray(prospectEmployees.id, input.employeeIds));

      let created = 0;
      let merged = 0;
      const results: Array<{ employeeId: number; contactId: number; action: "created" | "merged" }> = [];
      for (const r of rows) {
        const company = r.company;
        const e = r.employee;
        const result = await createOrMergeContact({
          organizationId: orgId,
          firstName: e.firstName ?? null,
          lastName: e.lastName ?? null,
          fullName: e.fullName,
          email: e.email ?? null,
          title: e.title ?? null,
          company: company?.name ?? null,
          companyWebsite: company?.domain ? `https://${company.domain}` : null,
          linkedinUrl: e.linkedinUrl ?? null,
          location: [e.locationCity, e.locationAdmin1, e.locationCountry].filter(Boolean).join(", ") || null,
          source: "prospect_search",
          stage: e.email ? "enriched" : "new",
          emailStatus: e.emailStatus === "mx_present" ? "valid" : e.emailStatus === "mx_absent" ? "invalid" : "unknown",
        });
        results.push({ employeeId: e.id, contactId: result.contact.id, action: result.action });
        if (result.action === "created") created++;
        else merged++;
      }
      return { created, merged, results };
    }),

  /** Per-tenant aggregate stats for the Search hero strip. */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const orgId = dataScopeOrganizationId(ctx.user);
    if (orgId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
    }
    const db = await getDb();
    if (!db) {
      return {
        totals: { companies: 0, employees: 0, employeesWithEmail: 0 },
        byCountry: [],
        byIndustry: [],
      };
    }

    const [totals] = await db
      .select({ companies: sql<number>`COUNT(DISTINCT ${prospectCompanies.id})` })
      .from(prospectCompanies)
      .where(eq(prospectCompanies.status, "active"));

    const [empTotals] = await db
      .select({
        employees: sql<number>`COUNT(*)`,
        withEmail: sql<number>`SUM(CASE WHEN ${prospectEmployees.emailStatus} = 'mx_present' THEN 1 ELSE 0 END)`,
      })
      .from(prospectEmployees);

    const byCountry = await db
      .select({ country: prospectCompanies.hqCountry, count: sql<number>`COUNT(*)` })
      .from(prospectCompanies)
      .where(and(eq(prospectCompanies.status, "active"), isNotNull(prospectCompanies.hqCountry)))
      .groupBy(prospectCompanies.hqCountry)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50);

    const byIndustry = await db
      .select({ industryCode: prospectCompanies.industryCode, count: sql<number>`COUNT(*)` })
      .from(prospectCompanies)
      .where(and(eq(prospectCompanies.status, "active"), isNotNull(prospectCompanies.industryCode)))
      .groupBy(prospectCompanies.industryCode)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50);

    return {
      totals: {
        companies: Number(totals?.companies ?? 0),
        employees: Number(empTotals?.employees ?? 0),
        employeesWithEmail: Number(empTotals?.withEmail ?? 0),
      },
      byCountry: byCountry.map(r => ({ country: r.country, count: Number(r.count) })),
      byIndustry: byIndustry.map(r => ({ industryCode: r.industryCode, count: Number(r.count) })),
    };
  }),

  initializePlatform: protectedProcedure
    .input(
      z.object({
        importBootstrapCsv: z.boolean().default(false),
        bootstrapCsvPath: z.string().trim().min(1).max(400).default("scripts/bootstrap_companies_1000_with_domains.csv"),
        runTicks: z.boolean().default(true),
      }).default({ importBootstrapCsv: false, bootstrapCsvPath: "scripts/bootstrap_companies_1000_with_domains.csv", runTicks: true }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin role required." });
      }
      if (!(await hasProspectSchema())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Prospect DB tables are missing in the current database. Run `pnpm db:migrate` on this environment, then retry initialization.",
        });
      }
      await seedProspectDb();

      let importedCompanies = 0;
      let enqueuedJobs = 0;
      if (input.importBootstrapCsv) {
        const p = resolve(process.cwd(), input.bootstrapCsvPath);
        const raw = await readFile(p, "utf8");
        const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>;
        for (const row of records) {
          const name = (row.name ?? "").trim();
          if (!name) continue;
          const domain = normalizeDomain((row.domain ?? "").trim() || null);
          const source = (row.source ?? "user_import").trim() || "user_import";
          const sourceEvidenceUrl = (row.sourceEvidenceUrl ?? "bootstrap_csv").trim() || "bootstrap_csv";
          const upserted = await upsertCompany({
            name,
            domain,
            source: source as any,
            sourceEvidenceUrl,
          });
          if (!upserted) continue;
          importedCompanies++;
          if (!upserted.company.domain) {
            await enqueueJobs([{ kind: "resolve_domain", payload: { companyId: upserted.company.id }, priority: 2 }]);
            enqueuedJobs++;
          } else {
            await enqueueJobs([{ kind: "crawl_website", payload: { companyId: upserted.company.id }, priority: 2 }]);
            enqueuedJobs++;
          }
        }
      }

      let ticks = { seeds: { processed: 0, errors: 0 }, queueCompany: { processed: 0, errors: 0 }, queueEmployee: { processed: 0, errors: 0 } };
      if (input.runTicks) {
        ticks = {
          seeds: await tickSeeds(),
          queueCompany: await tickQueueCompany(),
          queueEmployee: await tickQueueEmployee(),
        };
      }

      return {
        seeded: true,
        importedCompanies,
        enqueuedJobs,
        ticks,
      };
    }),

  /**
   * Platform-wide health snapshot of the autonomous catalogue. Restricted to
   * superadmins so they can monitor crawler growth, queue depth, and sources.
   */
  platformOverview: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin role required." });
    }
    if (!(await hasProspectSchema())) {
      return emptyPlatformOverview();
    }
    const db = await getDb();
    if (!db) return emptyPlatformOverview();

    try {
      // Ensure seed rows exist even if scheduler wasn't running yet.
      await seedProspectDb();
      const [companyTotals] = await db
      .select({
        all: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN ${prospectCompanies.status} = 'active' THEN 1 ELSE 0 END)`,
        withDomain: sql<number>`SUM(CASE WHEN ${prospectCompanies.domain} IS NOT NULL THEN 1 ELSE 0 END)`,
        verified: sql<number>`SUM(CASE WHEN ${prospectCompanies.websiteVerified} = 1 THEN 1 ELSE 0 END)`,
        withLinkedin: sql<number>`SUM(CASE WHEN ${prospectCompanies.linkedinUrl} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(prospectCompanies);

    const [empTotals] = await db
      .select({
        all: sql<number>`COUNT(*)`,
        withEmail: sql<number>`SUM(CASE WHEN ${prospectEmployees.emailStatus} = 'mx_present' THEN 1 ELSE 0 END)`,
        withLinkedin: sql<number>`SUM(CASE WHEN ${prospectEmployees.linkedinUrl} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(prospectEmployees);

    const companiesBySource = await db
      .select({ source: prospectCompanies.source, count: sql<number>`COUNT(*)` })
      .from(prospectCompanies)
      .groupBy(prospectCompanies.source)
      .orderBy(sql`COUNT(*) DESC`);

    const employeesBySource = await db
      .select({ source: prospectEmployees.source, count: sql<number>`COUNT(*)` })
      .from(prospectEmployees)
      .groupBy(prospectEmployees.source)
      .orderBy(sql`COUNT(*) DESC`);

    const byCountry = await db
      .select({ country: prospectCompanies.hqCountry, count: sql<number>`COUNT(*)` })
      .from(prospectCompanies)
      .where(and(eq(prospectCompanies.status, "active"), isNotNull(prospectCompanies.hqCountry)))
      .groupBy(prospectCompanies.hqCountry)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(30);

    const byIndustry = await db
      .select({ industryCode: prospectCompanies.industryCode, count: sql<number>`COUNT(*)` })
      .from(prospectCompanies)
      .where(and(eq(prospectCompanies.status, "active"), isNotNull(prospectCompanies.industryCode)))
      .groupBy(prospectCompanies.industryCode)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(20);

    const bySeniority = await db
      .select({ level: prospectEmployees.seniorityLevel, count: sql<number>`COUNT(*)` })
      .from(prospectEmployees)
      .groupBy(prospectEmployees.seniorityLevel)
      .orderBy(sql`COUNT(*) DESC`);

    const byHeadcountBand = await db
      .select({ band: prospectCompanies.headcountBand, count: sql<number>`COUNT(*)` })
      .from(prospectCompanies)
      .where(and(eq(prospectCompanies.status, "active"), isNotNull(prospectCompanies.headcountBand)))
      .groupBy(prospectCompanies.headcountBand)
      .orderBy(sql`COUNT(*) DESC`);

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const companiesGrowth = await db
      .select({
        day: sql<string>`DATE(${prospectCompanies.firstSeenAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(prospectCompanies)
      .where(gte(prospectCompanies.firstSeenAt, fourteenDaysAgo))
      .groupBy(sql`DATE(${prospectCompanies.firstSeenAt})`)
      .orderBy(asc(sql`DATE(${prospectCompanies.firstSeenAt})`));

    const employeesGrowth = await db
      .select({
        day: sql<string>`DATE(${prospectEmployees.firstSeenAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(prospectEmployees)
      .where(gte(prospectEmployees.firstSeenAt, fourteenDaysAgo))
      .groupBy(sql`DATE(${prospectEmployees.firstSeenAt})`)
      .orderBy(asc(sql`DATE(${prospectEmployees.firstSeenAt})`));

    const queueByStatus = await db
      .select({ status: prospectCrawlQueue.status, count: sql<number>`COUNT(*)` })
      .from(prospectCrawlQueue)
      .groupBy(prospectCrawlQueue.status);

    const queueByKind = await db
      .select({
        kind: prospectCrawlQueue.kind,
        status: prospectCrawlQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(prospectCrawlQueue)
      .groupBy(prospectCrawlQueue.kind, prospectCrawlQueue.status)
      .orderBy(sql`COUNT(*) DESC`);

    const recentRuns = await db
      .select()
      .from(prospectCrawlRuns)
      .orderBy(desc(prospectCrawlRuns.startedAt))
      .limit(20);

    const seedHealth = await db
      .select({
        id: prospectCrawlSeeds.id,
        kind: prospectCrawlSeeds.kind,
        region: prospectCrawlSeeds.region,
        enabled: prospectCrawlSeeds.enabled,
        consecutiveErrors: prospectCrawlSeeds.consecutiveErrors,
        lastRunAt: prospectCrawlSeeds.lastRunAt,
        nextRunAt: prospectCrawlSeeds.nextRunAt,
        frequencyMinutes: prospectCrawlSeeds.frequencyMinutes,
      })
      .from(prospectCrawlSeeds)
      .orderBy(desc(prospectCrawlSeeds.consecutiveErrors), asc(prospectCrawlSeeds.kind))
      .limit(80);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const budget = await db
      .select()
      .from(prospectDailyBudget)
      .where(gte(prospectDailyBudget.bucketDay, sevenDaysAgo))
      .orderBy(desc(prospectDailyBudget.bucketDay));

      return {
        totals: {
          companies: Number(companyTotals?.all ?? 0),
          companiesActive: Number(companyTotals?.active ?? 0),
          companiesWithDomain: Number(companyTotals?.withDomain ?? 0),
          companiesVerified: Number(companyTotals?.verified ?? 0),
          companiesWithLinkedin: Number(companyTotals?.withLinkedin ?? 0),
          employees: Number(empTotals?.all ?? 0),
          employeesWithEmail: Number(empTotals?.withEmail ?? 0),
          employeesWithLinkedin: Number(empTotals?.withLinkedin ?? 0),
        },
        bySource: {
          companies: companiesBySource.map(r => ({ source: r.source, count: Number(r.count) })),
          employees: employeesBySource.map(r => ({ source: r.source, count: Number(r.count) })),
        },
        byCountry: byCountry.map(r => ({ country: r.country, count: Number(r.count) })),
        byIndustry: byIndustry.map(r => ({ industryCode: r.industryCode, count: Number(r.count) })),
        bySeniority: bySeniority.map(r => ({ level: r.level, count: Number(r.count) })),
        byHeadcountBand: byHeadcountBand.map(r => ({ band: r.band, count: Number(r.count) })),
        growth: {
          companies: companiesGrowth.map(r => ({ day: r.day, count: Number(r.count) })),
          employees: employeesGrowth.map(r => ({ day: r.day, count: Number(r.count) })),
        },
        queue: {
          byStatus: queueByStatus.map(r => ({ status: r.status, count: Number(r.count) })),
          byKind: queueByKind.map(r => ({ kind: r.kind, status: r.status, count: Number(r.count) })),
        },
        recentRuns,
        seedHealth,
        budget,
      };
    } catch (err: any) {
      console.warn(`[prospectSearch.platformOverview] returning empty snapshot:`, err?.message ?? err);
      return emptyPlatformOverview();
    }
  }),

  /**
   * Browse the raw catalogue tables (superadmin only). Used by the platform
   * "Prospect DB" tab so admins can see how growth is going row-by-row.
   */
  platformContacts: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["companies", "employees"]).default("employees"),
        q: z.string().trim().max(120).optional(),
        sources: z.array(z.enum(PROSPECT_SOURCES)).max(7).optional(),
        emailFilter: z.enum(EMAIL_FILTERS).optional(),
        cursor: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin role required." });
      }
      const db = await getDb();
      if (!db) return { items: [] as Array<unknown>, nextCursor: null as number | null };
      const offset = input.cursor ?? 0;
      try {
        if (input.scope === "companies") {
        const conds = [];
        if (input.q) {
          if (input.q.length >= 4) {
            conds.push(sql`MATCH(${prospectCompanies.name}) AGAINST (${input.q} IN NATURAL LANGUAGE MODE)`);
          } else {
            conds.push(like(prospectCompanies.name, `%${input.q}%`));
          }
        }
        if (input.sources?.length) conds.push(inArray(prospectCompanies.source, input.sources));
        const rows = await db
          .select()
          .from(prospectCompanies)
          .where(conds.length ? and(...conds) : undefined)
          .orderBy(desc(prospectCompanies.firstSeenAt), desc(prospectCompanies.id))
          .limit(input.limit + 1)
          .offset(offset);
        const items = rows.slice(0, input.limit);
        const nextCursor = rows.length > input.limit ? offset + input.limit : null;
        return { items, nextCursor };
      }

      const conds = [];
      if (input.q) {
        if (input.q.length >= 4) {
          conds.push(
            sql`MATCH(${prospectEmployees.fullName}, ${prospectEmployees.title}) AGAINST (${input.q} IN NATURAL LANGUAGE MODE)`,
          );
        } else {
          conds.push(
            or(
              like(prospectEmployees.fullName, `%${input.q}%`),
              like(prospectEmployees.title, `%${input.q}%`),
            )!,
          );
        }
      }
      if (input.sources?.length) conds.push(inArray(prospectEmployees.source, input.sources));
      switch (input.emailFilter) {
        case "with_email":
          conds.push(eq(prospectEmployees.emailStatus, "mx_present"));
          break;
        case "without_email":
          conds.push(eq(prospectEmployees.emailStatus, "unknown"));
          break;
        case "mx_absent":
          conds.push(eq(prospectEmployees.emailStatus, "mx_absent"));
          break;
        case "any":
        default:
          break;
      }
      const rows = await db
        .select({ employee: prospectEmployees, company: prospectCompanies })
        .from(prospectEmployees)
        .leftJoin(prospectCompanies, eq(prospectCompanies.id, prospectEmployees.companyId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(prospectEmployees.firstSeenAt), desc(prospectEmployees.id))
        .limit(input.limit + 1)
        .offset(offset);
      const items = rows.slice(0, input.limit).map(r => ({
        ...r.employee,
        company: r.company
          ? { id: r.company.id, name: r.company.name, domain: r.company.domain }
          : null,
      }));
      const nextCursor = rows.length > input.limit ? offset + input.limit : null;
      return { items, nextCursor };
      } catch (err: any) {
        console.warn(`[prospectSearch.platformContacts] returning empty rows:`, err?.message ?? err);
        return { items: [] as Array<unknown>, nextCursor: null as number | null };
      }
    }),
});
