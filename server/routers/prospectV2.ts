/**
 * Prospect v2: per-tenant MySQL `companies`, `people`, and `crm_contacts` for Apollo-like search/import.
 *
 * Legacy `contacts` still power `/app/contacts`, campaigns, and `campaign_contacts`; those flows are unchanged.
 * `person_contact_links` maps v2 `people` to legacy `contacts.id` so callers can bridge into existing enrollment
 * (`ensureLegacyContactsForPeople`, `preparePeopleForCampaign`) without migrating `campaign_contacts` yet.
 */

import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { companies, crmContacts, type Company, type CrmContact, type Person, type User } from "../../drizzle/schema";
import { workspaceOrganizationId } from "../_core/authz";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  listCompaniesCursor,
  listPeopleCursor,
  searchCompaniesMysql,
  searchPeopleMysql,
  type ListCompaniesFilters,
  type ListPeopleFilters,
  type SearchCompaniesFilters,
  type SearchPeopleFilters,
} from "../prospectDb";
import {
  ensureLegacyContactsForPeople,
  LEGACY_BRIDGE_MAX_PERSON_IDS,
  preparePeopleForCampaign,
} from "../services/prospectContactBridge";

const limitSchema = z.number().int().min(1).max(100).default(50);

const cursorSchema = z
  .object({
    updatedAt: z.coerce.date(),
    id: z.string().regex(/^\d+$/),
  })
  .optional();

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

function bigString(id: bigint | null | undefined): string | null {
  if (id == null) return null;
  return String(id);
}

export type ProspectV2CompanySummaryDto = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  companySize: string | null;
  headcount: number | null;
  country: string | null;
  city: string | null;
};

export type ProspectV2PersonDto = {
  id: string;
  organizationId: number;
  companyId: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  title: string | null;
  titleNormalized: string | null;
  seniorityLevel: Person["seniorityLevel"];
  department: string | null;
  email: string | null;
  emailDomain: string | null;
  emailStatus: Person["emailStatus"];
  linkedinUrl: string | null;
  country: string | null;
  city: string | null;
  source: string | null;
  confidence: number | null;
  lastVerifiedAt: string | null;
  lastEnrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProspectV2PersonListItemDto = {
  person: ProspectV2PersonDto;
  company: ProspectV2CompanySummaryDto | null;
  crm: { stage: CrmContact["stage"]; importBatchId: string | null } | null;
};

export type ProspectV2CompanyListItemDto = {
  company: ProspectV2CompanySummaryDto & {
    nameNormalized: string | null;
    source: string | null;
    confidence: number | null;
    lastEnrichedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
};

function companyToSummaryDto(c: Company): ProspectV2CompanySummaryDto {
  return {
    id: String(c.id),
    name: c.name,
    domain: c.domain,
    website: c.website,
    linkedinUrl: c.linkedinUrl,
    industry: c.industry,
    companySize: c.companySize,
    headcount: c.headcount,
    country: c.country,
    city: c.city,
  };
}

function companyToFullDto(c: Company): ProspectV2CompanyListItemDto["company"] {
  return {
    ...companyToSummaryDto(c),
    nameNormalized: c.nameNormalized,
    source: c.source,
    confidence: c.confidence,
    lastEnrichedAt: toIso(c.lastEnrichedAt ?? undefined),
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
  };
}

function personToDto(p: Person): ProspectV2PersonDto {
  return {
    id: String(p.id),
    organizationId: p.organizationId,
    companyId: bigString(p.companyId ?? undefined),
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: p.fullName,
    title: p.title,
    titleNormalized: p.titleNormalized,
    seniorityLevel: p.seniorityLevel,
    department: p.department,
    email: p.email,
    emailDomain: p.emailDomain,
    emailStatus: p.emailStatus,
    linkedinUrl: p.linkedinUrl,
    country: p.country,
    city: p.city,
    source: p.source,
    confidence: p.confidence,
    lastVerifiedAt: toIso(p.lastVerifiedAt ?? undefined),
    lastEnrichedAt: toIso(p.lastEnrichedAt ?? undefined),
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}

async function hydratePeopleListItems(
  organizationId: number,
  items: Person[],
): Promise<ProspectV2PersonListItemDto[]> {
  const db = await getDb();
  if (!db || items.length === 0) {
    return items.map(p => ({ person: personToDto(p), company: null, crm: null }));
  }
  const personIds = items.map(p => p.id);
  const companyIds = Array.from(new Set(items.map(p => p.companyId).filter((x): x is bigint => x != null)));

  const [companyRows, crmRows] = await Promise.all([
    companyIds.length
      ? db
          .select()
          .from(companies)
          .where(and(eq(companies.organizationId, organizationId), inArray(companies.id, companyIds)))
      : Promise.resolve([] as Company[]),
    db
      .select()
      .from(crmContacts)
      .where(and(eq(crmContacts.organizationId, organizationId), inArray(crmContacts.personId, personIds))),
  ]);

  const companyById = new Map(companyRows.map(c => [c.id, c]));
  const crmByPersonId = new Map(crmRows.map(r => [r.personId, r]));

  return items.map(p => {
    const c = p.companyId != null ? companyById.get(p.companyId) : undefined;
    const crm = crmByPersonId.get(p.id);
    return {
      person: personToDto(p),
      company: c ? companyToSummaryDto(c) : null,
      crm: crm
        ? { stage: crm.stage, importBatchId: crm.importBatchId ?? null }
        : null,
    };
  });
}

function requireWorkspaceOrgId(user: User | null): number {
  const id = workspaceOrganizationId(user);
  if (id == null) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization context required for prospect v2.",
    });
  }
  return id;
}

const peopleListFiltersSchema = z
  .object({
    emailStatus: z.enum(["unknown", "valid", "invalid", "catch_all", "risky", "mx_present", "mx_absent"]).optional(),
    seniorityLevel: z.enum(["unknown", "c_level", "head", "director", "manager", "ic"]).optional(),
    department: z.string().optional(),
    country: z.string().optional(),
    companyId: z.string().regex(/^\d+$/).optional(),
  })
  .optional();

const peopleSearchFiltersSchema = z
  .object({
    emailStatus: z.enum(["unknown", "valid", "invalid", "catch_all", "risky", "mx_present", "mx_absent"]).optional(),
    seniorityLevel: z.enum(["unknown", "c_level", "head", "director", "manager", "ic"]).optional(),
    department: z.string().optional(),
    country: z.string().optional(),
    companyId: z.string().regex(/^\d+$/).optional(),
    companyIndustry: z.string().optional(),
  })
  .optional();

const companiesFiltersSchema = z
  .object({
    industry: z.string().optional(),
    country: z.string().optional(),
    companySize: z.string().optional(),
  })
  .optional();

function parseCursor(c?: z.infer<typeof cursorSchema>): { updatedAt: Date; id: bigint } | undefined {
  if (!c) return undefined;
  return { updatedAt: c.updatedAt, id: BigInt(c.id) };
}

const personIdsBridgeSchema = z.object({
  personIds: z.array(z.string().regex(/^\d+$/)).max(LEGACY_BRIDGE_MAX_PERSON_IDS),
});

function parsePersonIdStrings(ids: string[]): bigint[] {
  return ids.map(s => BigInt(s));
}

export const prospectV2Router = router({
  listPeople: protectedProcedure
    .input(
      z.object({
        limit: limitSchema,
        cursor: cursorSchema,
        filters: peopleListFiltersSchema,
      }),
    )
    .query(async ({ input, ctx }) => {
      const organizationId = requireWorkspaceOrgId(ctx.user);
      const filters: ListPeopleFilters | undefined = input.filters
        ? {
            ...input.filters,
            companyId: input.filters.companyId ? BigInt(input.filters.companyId) : undefined,
          }
        : undefined;
      const { items, nextCursor } = await listPeopleCursor({
        organizationId,
        limit: input.limit,
        cursorUpdatedAt: input.cursor?.updatedAt,
        cursorId: input.cursor?.id,
        filters,
      });
      const rows = await hydratePeopleListItems(organizationId, items);
      return {
        items: rows,
        nextCursor: nextCursor
          ? { updatedAt: nextCursor.updatedAt.toISOString(), id: String(nextCursor.id) }
          : null,
      };
    }),

  searchPeople: protectedProcedure
    .input(
      z.object({
        query: z.string().max(500).default(""),
        limit: limitSchema,
        cursor: cursorSchema,
        filters: peopleSearchFiltersSchema,
      }),
    )
    .query(async ({ input, ctx }) => {
      const organizationId = requireWorkspaceOrgId(ctx.user);
      const filters: SearchPeopleFilters | undefined = input.filters
        ? {
            ...input.filters,
            companyId: input.filters.companyId ? BigInt(input.filters.companyId) : undefined,
          }
        : undefined;
      const { items, nextCursor } = await searchPeopleMysql({
        organizationId,
        query: input.query,
        limit: input.limit,
        cursor: parseCursor(input.cursor),
        filters,
      });
      const rows = await hydratePeopleListItems(organizationId, items);
      return {
        items: rows,
        nextCursor: nextCursor
          ? { updatedAt: nextCursor.updatedAt.toISOString(), id: String(nextCursor.id) }
          : null,
      };
    }),

  listCompanies: protectedProcedure
    .input(
      z.object({
        limit: limitSchema,
        cursor: cursorSchema,
        filters: companiesFiltersSchema,
      }),
    )
    .query(async ({ input, ctx }) => {
      const organizationId = requireWorkspaceOrgId(ctx.user);
      const filters = input.filters as ListCompaniesFilters | undefined;
      const { items, nextCursor } = await listCompaniesCursor({
        organizationId,
        limit: input.limit,
        cursorUpdatedAt: input.cursor?.updatedAt,
        cursorId: input.cursor?.id,
        filters,
      });
      return {
        items: items.map(c => ({ company: companyToFullDto(c) })),
        nextCursor: nextCursor
          ? { updatedAt: nextCursor.updatedAt.toISOString(), id: String(nextCursor.id) }
          : null,
      };
    }),

  searchCompanies: protectedProcedure
    .input(
      z.object({
        query: z.string().max(500).default(""),
        limit: limitSchema,
        cursor: cursorSchema,
        filters: companiesFiltersSchema,
      }),
    )
    .query(async ({ input, ctx }) => {
      const organizationId = requireWorkspaceOrgId(ctx.user);
      const filters = input.filters as SearchCompaniesFilters | undefined;
      const { items, nextCursor } = await searchCompaniesMysql({
        organizationId,
        query: input.query,
        limit: input.limit,
        cursor: parseCursor(input.cursor),
        filters,
      });
      return {
        items: items.map(c => ({ company: companyToFullDto(c) })),
        nextCursor: nextCursor
          ? { updatedAt: nextCursor.updatedAt.toISOString(), id: String(nextCursor.id) }
          : null,
      };
    }),

  /**
   * Ensures each v2 person has a linked legacy `contacts` row (see `person_contact_links`).
   * Use returned `contactId`s with existing campaign enrollment APIs; this does not enroll.
   */
  ensureLegacyContactsForPeople: protectedProcedure.input(personIdsBridgeSchema).mutation(async ({ input, ctx }) => {
    const organizationId = requireWorkspaceOrgId(ctx.user);
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not available." });
    }
    try {
      const mappings = await ensureLegacyContactsForPeople({
        organizationId,
        personIds: parsePersonIdStrings(input.personIds),
      });
      return { mappings };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("At most")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
    }
  }),

  /**
   * Same as `ensureLegacyContactsForPeople` plus a stable `contactIds` list for callers.
   * `campaignId` is reserved for future enrollment wiring; no automatic enrollment occurs.
   */
  preparePeopleForCampaign: protectedProcedure
    .input(
      z.object({
        personIds: z.array(z.string().regex(/^\d+$/)).max(LEGACY_BRIDGE_MAX_PERSON_IDS),
        campaignId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const organizationId = requireWorkspaceOrgId(ctx.user);
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not available." });
      }
      try {
        return await preparePeopleForCampaign({
          organizationId,
          personIds: parsePersonIdStrings(input.personIds),
          campaignId: input.campaignId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("At most")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: msg });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),
});
