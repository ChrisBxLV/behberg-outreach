import { and, desc, eq, getTableColumns, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import {
  companies,
  crmContacts,
  people,
  searchIndexJobs,
  type Company,
  type Person,
} from "../drizzle/schema";
import { getDb } from "./db";

const MAX_PAGE = 100;

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return MAX_PAGE;
  return Math.min(Math.floor(limit), MAX_PAGE);
}

function toBigint(v: bigint | string | number | undefined | null): bigint | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "bigint") return v;
  return BigInt(v);
}

function cursorPredicate(
  updatedAtCol: AnyMySqlColumn,
  idCol: AnyMySqlColumn,
  cursor?: { updatedAt: Date; id: bigint },
): SQL | undefined {
  if (!cursor?.updatedAt || cursor.id === undefined) return undefined;
  return or(
    lt(updatedAtCol, cursor.updatedAt),
    and(eq(updatedAtCol, cursor.updatedAt), lt(idCol, cursor.id)),
  );
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (value == null) return null;
  let s = value.trim();
  if (!s) return null;
  s = s.toLowerCase();
  if (!s.includes("://")) s = `https://${s}`;
  try {
    const u = new URL(s);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    s = s.replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!.toLowerCase();
    if (s.startsWith("www.")) s = s.slice(4);
    return s || null;
  }
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

export function normalizeName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = value.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.toLowerCase();
}

export function normalizeTitle(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

function normalizeLinkedin(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = value.trim().toLowerCase();
  return s || null;
}

export type ProspectSeniority =
  | "unknown"
  | "c_level"
  | "head"
  | "director"
  | "manager"
  | "ic";

export function inferSeniority(title: string | null | undefined): ProspectSeniority {
  const raw = (title || "").toLowerCase();
  const t = normalizeTitle(title) || raw;
  if (!t.trim()) return "unknown";

  if (
    /\b(ceo|cfo|cto|coo|cmo|cpo|cdo|cio|ciso|chro|chief)\b/.test(raw) ||
    raw.includes("chief ") ||
    raw.includes("president")
  ) {
    return "c_level";
  }
  if (raw.includes("head of") || raw.includes("vice president") || /\bvp\b/.test(raw) || raw.includes(" v.p")) {
    return "head";
  }
  if (raw.includes("director")) return "director";
  if (raw.includes("manager") || raw.includes("management")) return "manager";
  if (
    /\b(engineer|developer|devops|sre|analyst|specialist|associate|coordinator|representative|consultant|designer|scientist|architect|writer|editor)\b/.test(
      raw,
    )
  ) {
    return "ic";
  }
  return "unknown";
}

function isEmptyish(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function mergePatch<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  for (const [k, v] of Object.entries(incoming) as [keyof T, T[keyof T]][]) {
    if (v === undefined) continue;
    const cur = existing[k];
    if (!isEmptyish(cur)) continue;
    if (v === null) continue;
    patch[k] = v;
  }
  return patch;
}

export type UpsertCompanyInput = {
  organizationId: number;
  name: string;
  nameNormalized?: string | null;
  domain?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  industry?: string | null;
  companySize?: string | null;
  headcount?: number | null;
  country?: string | null;
  city?: string | null;
  source?: string | null;
  confidence?: number | null;
  lastEnrichedAt?: Date | null;
};

export async function upsertCompanyForOrganization(input: UpsertCompanyInput): Promise<bigint | null> {
  const db = await getDb();
  if (!db) return null;

  const orgId = input.organizationId;
  const domain = normalizeDomain(input.domain ?? undefined);
  // MySQL UNIQUE (organizationId, domain) allows multiple NULL domains; dedupe by domain only when non-null.
  const linkedin = normalizeLinkedin(input.linkedinUrl);
  // Dedupe by LinkedIn URL only when non-empty after normalization (avoid matching empty strings).
  const nameNorm = input.nameNormalized?.trim() || normalizeName(input.name) || null;

  let row: Company | undefined;
  if (domain) {
    [row] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.organizationId, orgId), eq(companies.domain, domain)))
      .limit(1);
  }
  if (!row && linkedin) {
    [row] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.organizationId, orgId), eq(companies.linkedinUrl, linkedin)))
      .limit(1);
  }
  if (!row && nameNorm) {
    [row] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.organizationId, orgId), eq(companies.nameNormalized, nameNorm)))
      .limit(1);
  }

  const enrichmentTouch =
    input.lastEnrichedAt ??
    ([input.industry, input.headcount, input.companySize, input.linkedinUrl, input.website].some(v => !isEmptyish(v))
      ? new Date()
      : undefined);

  if (!row) {
    const insertRow = {
      organizationId: orgId,
      name: input.name.trim(),
      nameNormalized: nameNorm,
      domain: domain ?? null,
      website: input.website ?? null,
      linkedinUrl: linkedin ?? (input.linkedinUrl?.trim() ? input.linkedinUrl.trim().toLowerCase() : null),
      industry: input.industry ?? null,
      companySize: input.companySize ?? null,
      headcount: input.headcount ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      source: input.source ?? null,
      confidence: input.confidence ?? null,
      lastEnrichedAt: enrichmentTouch ?? null,
    };
    const insertRes = await db.insert(companies).values(insertRow);
    const rawId = (insertRes as { insertId?: number | bigint }).insertId;
    let id: bigint | null = null;
    if (rawId !== undefined && rawId !== null) {
      id = typeof rawId === "bigint" ? rawId : BigInt(rawId);
    }
    if (id == null) {
      const [created] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          domain
            ? and(eq(companies.organizationId, orgId), eq(companies.domain, domain))
            : linkedin
              ? and(eq(companies.organizationId, orgId), eq(companies.linkedinUrl, linkedin))
              : nameNorm
                ? and(eq(companies.organizationId, orgId), eq(companies.nameNormalized, nameNorm))
                : and(eq(companies.organizationId, orgId), eq(companies.name, input.name.trim())),
        )
        .orderBy(desc(companies.id))
        .limit(1);
      id = created?.id ?? null;
    }
    if (id != null) await enqueueSearchIndexJob({ organizationId: orgId, entityType: "company", entityId: id, action: "upsert" });
    return id;
  }

  const patch = mergePatch(row as unknown as Record<string, unknown>, {
    name: input.name.trim(),
    nameNormalized: nameNorm ?? undefined,
    domain: domain ?? undefined,
    website: input.website ?? undefined,
    linkedinUrl: (linkedin ?? input.linkedinUrl?.trim()?.toLowerCase()) || undefined,
    industry: input.industry ?? undefined,
    companySize: input.companySize ?? undefined,
    headcount: input.headcount ?? undefined,
    country: input.country ?? undefined,
    city: input.city ?? undefined,
    source: input.source ?? undefined,
    confidence: input.confidence ?? undefined,
    lastEnrichedAt: enrichmentTouch ?? undefined,
  } as Record<string, unknown>) as Partial<typeof companies.$inferInsert>;

  const finalPatch: Partial<typeof companies.$inferInsert> = { ...patch };
  if (enrichmentTouch) finalPatch.lastEnrichedAt = enrichmentTouch;
  if (Object.keys(finalPatch).length) {
    await db.update(companies).set(finalPatch).where(eq(companies.id, row.id));
    await enqueueSearchIndexJob({ organizationId: orgId, entityType: "company", entityId: row.id, action: "upsert" });
  }
  return row.id;
}

export type UpsertPersonInput = {
  organizationId: number;
  companyId?: bigint | string | number | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  title?: string | null;
  titleNormalized?: string | null;
  seniorityLevel?: Person["seniorityLevel"] | null;
  department?: string | null;
  email?: string | null;
  emailStatus?: Person["emailStatus"] | null;
  linkedinUrl?: string | null;
  country?: string | null;
  city?: string | null;
  source?: string | null;
  confidence?: number | null;
  lastVerifiedAt?: Date | null;
  lastEnrichedAt?: Date | null;
};

export async function upsertPersonForOrganization(input: UpsertPersonInput): Promise<bigint | null> {
  const db = await getDb();
  if (!db) return null;

  const orgId = input.organizationId;
  const email = normalizeEmail(input.email ?? undefined);
  // UNIQUE (organizationId, email) allows multiple NULL emails; application dedupe uses email only when normalized email is non-null.
  const linkedin = normalizeLinkedin(input.linkedinUrl);
  // Dedupe by LinkedIn only when non-empty (normalized); empty URLs must not participate in unique matching.
  const companyId = toBigint(input.companyId ?? undefined);
  const fullName = input.fullName?.trim() || null;

  let row: Person | undefined;
  if (email) {
    [row] = await db
      .select()
      .from(people)
      .where(and(eq(people.organizationId, orgId), eq(people.email, email)))
      .limit(1);
  }
  if (!row && linkedin) {
    [row] = await db
      .select()
      .from(people)
      .where(and(eq(people.organizationId, orgId), eq(people.linkedinUrl, linkedin)))
      .limit(1);
  }
  if (!row && companyId != null && fullName) {
    [row] = await db
      .select()
      .from(people)
      .where(
        and(eq(people.organizationId, orgId), eq(people.companyId, companyId), eq(people.fullName, fullName)),
      )
      .limit(1);
  }

  const titleNorm = input.titleNormalized ?? normalizeTitle(input.title ?? undefined);
  const seniority =
    input.seniorityLevel && input.seniorityLevel !== "unknown"
      ? input.seniorityLevel
      : inferSeniority(input.title ?? undefined);
  const emailDomain = email ? (email.split("@")[1] ?? null) : null;

  const enrichmentTouch =
    input.lastEnrichedAt ??
    ([input.title, input.department, input.email, input.linkedinUrl].some(v => !isEmptyish(v)) ? new Date() : undefined);

  if (!row) {
    const insertRes = await db.insert(people).values({
      organizationId: orgId,
      companyId: companyId ?? null,
      firstName: input.firstName?.trim() ?? null,
      lastName: input.lastName?.trim() ?? null,
      fullName,
      title: input.title?.trim() ?? null,
      titleNormalized: titleNorm,
      seniorityLevel: seniority as Person["seniorityLevel"],
      department: input.department?.trim() ?? null,
      email,
      emailDomain,
      emailStatus: input.emailStatus ?? "unknown",
      linkedinUrl: input.linkedinUrl?.trim() ? linkedin ?? input.linkedinUrl.trim().toLowerCase() : null,
      country: input.country?.trim() ?? null,
      city: input.city?.trim() ?? null,
      source: input.source ?? null,
      confidence: input.confidence ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
      lastEnrichedAt: enrichmentTouch ?? null,
    });
    const rawId = (insertRes as { insertId?: number | bigint }).insertId;
    let id: bigint | null = null;
    if (rawId !== undefined && rawId !== null) {
      id = typeof rawId === "bigint" ? rawId : BigInt(rawId);
    }
    if (id == null) {
      const whereClause = email
        ? and(eq(people.organizationId, orgId), eq(people.email, email))
        : linkedin
          ? and(eq(people.organizationId, orgId), eq(people.linkedinUrl, linkedin))
          : companyId != null && fullName
            ? and(eq(people.organizationId, orgId), eq(people.companyId, companyId), eq(people.fullName, fullName))
            : null;
      if (whereClause) {
        const [created] = await db
          .select({ id: people.id })
          .from(people)
          .where(whereClause)
          .orderBy(desc(people.id))
          .limit(1);
        id = created?.id ?? null;
      }
    }
    if (id != null) await enqueueSearchIndexJob({ organizationId: orgId, entityType: "person", entityId: id, action: "upsert" });
    return id;
  }

  const patch = mergePatch(row as unknown as Record<string, unknown>, {
    companyId: companyId ?? undefined,
    firstName: input.firstName?.trim() ?? undefined,
    lastName: input.lastName?.trim() ?? undefined,
    fullName: fullName ?? undefined,
    title: input.title?.trim() ?? undefined,
    titleNormalized: titleNorm ?? undefined,
    department: input.department?.trim() ?? undefined,
    email: email ?? undefined,
    emailDomain: emailDomain ?? undefined,
    emailStatus: input.emailStatus ?? undefined,
    linkedinUrl: input.linkedinUrl?.trim() ? linkedin ?? input.linkedinUrl.trim().toLowerCase() : undefined,
    country: input.country?.trim() ?? undefined,
    city: input.city?.trim() ?? undefined,
    source: input.source ?? undefined,
    confidence: input.confidence ?? undefined,
    lastVerifiedAt: input.lastVerifiedAt ?? undefined,
    lastEnrichedAt: enrichmentTouch ?? undefined,
  } as Record<string, unknown>) as Partial<typeof people.$inferInsert>;

  const finalPersonPatch: Partial<typeof people.$inferInsert> = { ...patch };
  // `mergePatch` only fills previously empty columns; `seniorityLevel` is never empty in MySQL (defaults to
  // `unknown`), so it must be updated outside `mergePatch` when title inputs change or seniority is explicit.
  const titleTouched = input.title !== undefined || input.titleNormalized !== undefined;
  const explicitSeniority = input.seniorityLevel != null;
  if (explicitSeniority) {
    finalPersonPatch.seniorityLevel = input.seniorityLevel as Person["seniorityLevel"];
  } else if (titleTouched) {
    finalPersonPatch.seniorityLevel = seniority as Person["seniorityLevel"];
  }
  if (enrichmentTouch) finalPersonPatch.lastEnrichedAt = enrichmentTouch;
  if (Object.keys(finalPersonPatch).length) {
    await db.update(people).set(finalPersonPatch).where(eq(people.id, row.id));
    await enqueueSearchIndexJob({ organizationId: orgId, entityType: "person", entityId: row.id, action: "upsert" });
  }
  return row.id;
}

export type CreateOrUpdateCrmContactInput = {
  organizationId: number;
  personId: bigint | string | number;
  stage?: (typeof crmContacts.$inferSelect)["stage"];
  notes?: string | null;
  tags?: string[] | null;
  importBatchId?: string | null;
};

export async function createOrUpdateCrmContact(input: CreateOrUpdateCrmContactInput): Promise<bigint | null> {
  const db = await getDb();
  if (!db) return null;
  const personId = toBigint(input.personId);
  if (personId === undefined) return null;

  const base = {
    organizationId: input.organizationId,
    personId,
    stage: input.stage ?? "new",
    notes: input.notes ?? null,
    tags: input.tags ?? null,
    importBatchId: input.importBatchId ?? null,
  };

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (input.stage !== undefined) updateSet.stage = input.stage;
  if (input.notes !== undefined) updateSet.notes = input.notes;
  if (input.tags !== undefined) updateSet.tags = input.tags;
  if (input.importBatchId !== undefined) updateSet.importBatchId = input.importBatchId;

  await db.insert(crmContacts).values(base).onDuplicateKeyUpdate({ set: updateSet });

  const [row] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.organizationId, input.organizationId), eq(crmContacts.personId, personId)))
    .limit(1);
  return row?.id ?? null;
}

export async function enqueueSearchIndexJob(input: {
  organizationId: number;
  entityType: "person" | "company";
  entityId: bigint;
  action: "upsert" | "delete";
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(searchIndexJobs).values({
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      status: "pending",
      attempts: 0,
      availableAt: new Date(),
    });
  } catch {
    // Outbox enqueue is best-effort; duplicate or transient DB issues should not break writes.
  }
}

export type ListPeopleFilters = {
  emailStatus?: Person["emailStatus"];
  seniorityLevel?: Person["seniorityLevel"];
  department?: string;
  country?: string;
  companyId?: bigint | string | number;
};

export async function listPeopleCursor(input: {
  organizationId: number;
  limit: number;
  cursorUpdatedAt?: Date;
  cursorId?: bigint | string | number;
  filters?: ListPeopleFilters;
}): Promise<{ items: Person[]; nextCursor: { updatedAt: Date; id: bigint } | null }> {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = clampLimit(input.limit);
  const cursorId = toBigint(input.cursorId);
  const cursor =
    input.cursorUpdatedAt && cursorId !== undefined
      ? { updatedAt: input.cursorUpdatedAt, id: cursorId }
      : undefined;

  const parts: SQL[] = [eq(people.organizationId, input.organizationId)];
  const f = input.filters;
  if (f?.emailStatus) parts.push(eq(people.emailStatus, f.emailStatus));
  if (f?.seniorityLevel) parts.push(eq(people.seniorityLevel, f.seniorityLevel));
  if (f?.department) parts.push(eq(people.department, f.department));
  if (f?.country) parts.push(eq(people.country, f.country));
  if (f?.companyId != null) {
    const cid = toBigint(f.companyId);
    if (cid !== undefined) parts.push(eq(people.companyId, cid));
  }
  const cPred = cursorPredicate(people.updatedAt, people.id, cursor);
  if (cPred) parts.push(cPred);

  const rows = await db
    .select()
    .from(people)
    .where(and(...parts))
    .orderBy(desc(people.updatedAt), desc(people.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const tail = items[items.length - 1];
  const nextCursor =
    hasMore && tail
      ? { updatedAt: tail.updatedAt as Date, id: tail.id as bigint }
      : null;
  return { items, nextCursor };
}

export type ListCompaniesFilters = {
  industry?: string;
  country?: string;
  companySize?: string;
};

export async function listCompaniesCursor(input: {
  organizationId: number;
  limit: number;
  cursorUpdatedAt?: Date;
  cursorId?: bigint | string | number;
  filters?: ListCompaniesFilters;
}): Promise<{ items: Company[]; nextCursor: { updatedAt: Date; id: bigint } | null }> {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = clampLimit(input.limit);
  const cursorId = toBigint(input.cursorId);
  const cursor =
    input.cursorUpdatedAt && cursorId !== undefined
      ? { updatedAt: input.cursorUpdatedAt, id: cursorId }
      : undefined;

  const parts: SQL[] = [eq(companies.organizationId, input.organizationId)];
  const f = input.filters;
  if (f?.industry) parts.push(eq(companies.industry, f.industry));
  if (f?.country) parts.push(eq(companies.country, f.country));
  if (f?.companySize) parts.push(eq(companies.companySize, f.companySize));
  const cPred = cursorPredicate(companies.updatedAt, companies.id, cursor);
  if (cPred) parts.push(cPred);

  const rows = await db
    .select()
    .from(companies)
    .where(and(...parts))
    .orderBy(desc(companies.updatedAt), desc(companies.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const tail = items[items.length - 1];
  const nextCursor =
    hasMore && tail
      ? { updatedAt: tail.updatedAt as Date, id: tail.id as bigint }
      : null;
  return { items, nextCursor };
}

export type SearchPeopleFilters = ListPeopleFilters & { companyIndustry?: string };

export async function searchPeopleMysql(input: {
  organizationId: number;
  query: string;
  filters?: SearchPeopleFilters;
  cursor?: { updatedAt: Date; id: bigint };
  limit: number;
}): Promise<{ items: Person[]; nextCursor: { updatedAt: Date; id: bigint } | null }> {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = clampLimit(input.limit);
  const q = input.query.trim();
  const needCompanyJoin = Boolean(input.filters?.companyIndustry);

  const parts: SQL[] = [eq(people.organizationId, input.organizationId)];
  const f = input.filters;
  if (f?.emailStatus) parts.push(eq(people.emailStatus, f.emailStatus));
  if (f?.seniorityLevel) parts.push(eq(people.seniorityLevel, f.seniorityLevel));
  if (f?.department) parts.push(eq(people.department, f.department));
  if (f?.country) parts.push(eq(people.country, f.country));
  if (f?.companyId != null) {
    const cid = toBigint(f.companyId);
    if (cid !== undefined) parts.push(eq(people.companyId, cid));
  }
  if (f?.companyIndustry) parts.push(eq(companies.industry, f.companyIndustry));

  const cPred = cursorPredicate(people.updatedAt, people.id, input.cursor);
  if (cPred) parts.push(cPred);

  if (q.length > 0) {
    const safe = q.slice(0, 200);
    parts.push(
      sql`MATCH (${people.fullName}, ${people.email}, ${people.title}) AGAINST (${safe} IN NATURAL LANGUAGE MODE)`,
    );
  }

  const whereSql = and(...parts);

  if (needCompanyJoin) {
    const rows = await db
      .select(getTableColumns(people))
      .from(people)
      .innerJoin(
        companies,
        and(eq(people.companyId, companies.id), eq(companies.organizationId, input.organizationId)),
      )
      .where(whereSql)
      .orderBy(desc(people.updatedAt), desc(people.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const tail = items[items.length - 1];
    return {
      items,
      nextCursor:
        hasMore && tail ? { updatedAt: tail.updatedAt as Date, id: tail.id as bigint } : null,
    };
  }

  const rows = await db
    .select()
    .from(people)
    .where(whereSql)
    .orderBy(desc(people.updatedAt), desc(people.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const tail = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && tail ? { updatedAt: tail.updatedAt as Date, id: tail.id as bigint } : null,
  };
}

export type SearchCompaniesFilters = ListCompaniesFilters;

export async function searchCompaniesMysql(input: {
  organizationId: number;
  query: string;
  filters?: SearchCompaniesFilters;
  cursor?: { updatedAt: Date; id: bigint };
  limit: number;
}): Promise<{ items: Company[]; nextCursor: { updatedAt: Date; id: bigint } | null }> {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = clampLimit(input.limit);
  const q = input.query.trim();

  const parts: SQL[] = [eq(companies.organizationId, input.organizationId)];
  const f = input.filters;
  if (f?.industry) parts.push(eq(companies.industry, f.industry));
  if (f?.country) parts.push(eq(companies.country, f.country));
  if (f?.companySize) parts.push(eq(companies.companySize, f.companySize));
  const cPred = cursorPredicate(companies.updatedAt, companies.id, input.cursor);
  if (cPred) parts.push(cPred);

  if (q.length > 0) {
    const safe = q.slice(0, 200);
    parts.push(
      sql`MATCH (${companies.name}, ${companies.domain}, ${companies.industry}) AGAINST (${safe} IN NATURAL LANGUAGE MODE)`,
    );
  }

  const rows = await db
    .select()
    .from(companies)
    .where(and(...parts))
    .orderBy(desc(companies.updatedAt), desc(companies.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const tail = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && tail ? { updatedAt: tail.updatedAt as Date, id: tail.id as bigint } : null,
  };
}
