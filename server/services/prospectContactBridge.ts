/**
 * Bridges prospect v2 `people` to legacy `contacts` so campaign code can keep using `contactId`.
 *
 * `person_contact_links` is a temporary compatibility layer. A future migration can move
 * `campaign_contacts` from `contactId` to `crm_contacts` / `personId` and retire this bridge.
 *
 * Campaign sending, `email_logs`, and schedulers remain unchanged; they still reference `contacts.id`.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  companies,
  contacts,
  crmContacts,
  people,
  personContactLinks,
  type Company,
  type CrmContact,
  type InsertContact,
  type Person,
} from "../../drizzle/schema";
import { findDuplicateContact, getDb } from "../db";

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ER_DUP_ENTRY");
}

function mapPersonEmailStatusToLegacy(status: Person["emailStatus"]): InsertContact["emailStatus"] {
  switch (status) {
    case "valid":
      return "valid";
    case "invalid":
      return "invalid";
    case "catch_all":
      return "catch_all";
    case "risky":
      return "risky";
    case "mx_present":
    case "mx_absent":
    default:
      return "unknown";
  }
}

function buildLocation(person: Person): string | null {
  const parts = [person.city?.trim(), person.country?.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function buildInsertContactDraft(
  organizationId: number,
  person: Person,
  company: Company | undefined,
  crm: CrmContact | undefined,
): InsertContact {
  const companyWebsite =
    company?.website?.trim() ||
    (company?.domain?.trim() ? `https://${company.domain.trim()}` : null) ||
    null;
  const normalizedDomain = company?.domain?.trim() || person.emailDomain?.trim() || null;
  return {
    organizationId,
    firstName: person.firstName ?? null,
    lastName: person.lastName ?? null,
    fullName: person.fullName ?? null,
    email: person.email ?? null,
    phone: null,
    title: person.title ?? null,
    company: company?.name ?? null,
    industry: company?.industry ?? null,
    companySize: company?.companySize ?? null,
    companyWebsite,
    linkedinUrl: person.linkedinUrl ?? null,
    normalizedDomain,
    emailStatus: mapPersonEmailStatusToLegacy(person.emailStatus),
    location: buildLocation(person),
    stage: (crm?.stage ?? "new") as InsertContact["stage"],
    source: person.source ?? "prospect_v2",
    importBatchId: crm?.importBatchId ?? null,
    tags: crm?.tags ?? [],
    enrichmentStatus: "not_enriched",
  };
}

type LinkInsertOutcome = "linked" | "contact_taken_by_other_person";

async function tryInsertPersonContactLink(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  organizationId: number,
  personId: bigint,
  contactId: number,
): Promise<LinkInsertOutcome> {
  try {
    await db.insert(personContactLinks).values({
      organizationId,
      personId,
      contactId,
    });
    return "linked";
  } catch (err) {
    if (!isMysqlDuplicateKeyError(err)) throw err;
    const [byPerson] = await db
      .select()
      .from(personContactLinks)
      .where(
        and(eq(personContactLinks.organizationId, organizationId), eq(personContactLinks.personId, personId)),
      )
      .limit(1);
    if (byPerson) {
      return "linked";
    }
    const [byContact] = await db
      .select()
      .from(personContactLinks)
      .where(
        and(
          eq(personContactLinks.organizationId, organizationId),
          eq(personContactLinks.contactId, contactId),
        ),
      )
      .limit(1);
    if (byContact && byContact.personId !== personId) {
      return "contact_taken_by_other_person";
    }
    return "linked";
  }
}

export type EnsureLegacyContactForPersonParams = {
  organizationId: number;
  personId: bigint;
};

/**
 * Returns a legacy `contacts.id` for this v2 person, creating or reusing a `contacts` row as needed.
 * Idempotent per (organizationId, personId). Does not null out existing rich contact fields when reusing a row.
 */
export async function ensureLegacyContactForPerson(
  params: EnsureLegacyContactForPersonParams,
): Promise<{ contactId: number; created: boolean }> {
  const { organizationId, personId } = params;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existingLink] = await db
    .select()
    .from(personContactLinks)
    .where(
      and(eq(personContactLinks.organizationId, organizationId), eq(personContactLinks.personId, personId)),
    )
    .limit(1);
  if (existingLink) {
    return { contactId: existingLink.contactId, created: false };
  }

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.organizationId, organizationId)))
    .limit(1);
  if (!person) {
    throw new Error("Person not found for organization");
  }

  let company: Company | undefined;
  if (person.companyId != null) {
    [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, person.companyId), eq(companies.organizationId, organizationId)))
      .limit(1);
  }

  const [crm] = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.organizationId, organizationId), eq(crmContacts.personId, personId)))
    .limit(1);

  const draft = buildInsertContactDraft(organizationId, person, company, crm);

  let duplicate = await findDuplicateContact(draft);
  if (duplicate) {
    const [linkOnContact] = await db
      .select()
      .from(personContactLinks)
      .where(
        and(
          eq(personContactLinks.organizationId, organizationId),
          eq(personContactLinks.contactId, duplicate.id),
        ),
      )
      .limit(1);
    if (linkOnContact && linkOnContact.personId !== personId) {
      duplicate = null;
    }
  }

  let contactId: number;
  let insertedNewContact = false;

  if (duplicate) {
    contactId = duplicate.id;
  } else {
    const insertResult = await db.insert(contacts).values(draft);
    let newId = Number((insertResult as { insertId?: number }).insertId ?? 0);
    if (!Number.isFinite(newId) || newId <= 0) {
      const [last] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.organizationId, organizationId))
        .orderBy(desc(contacts.id))
        .limit(1);
      newId = last?.id ?? 0;
    }
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error("Failed to resolve new contact id after insert");
    }
    contactId = newId;
    insertedNewContact = true;
  }

  let linkEstablished = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const outcome = await tryInsertPersonContactLink(db, organizationId, personId, contactId);
    if (outcome === "linked") {
      linkEstablished = true;
      break;
    }
    const insertResult = await db.insert(contacts).values(draft);
    let newId = Number((insertResult as { insertId?: number }).insertId ?? 0);
    if (!Number.isFinite(newId) || newId <= 0) {
      const [last] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.organizationId, organizationId))
        .orderBy(desc(contacts.id))
        .limit(1);
      newId = last?.id ?? 0;
    }
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error("Failed to resolve new contact id after insert");
    }
    contactId = newId;
    insertedNewContact = true;
  }
  if (!linkEstablished) {
    throw new Error("Could not establish person_contact_links after retries");
  }

  const [verify] = await db
    .select()
    .from(personContactLinks)
    .where(
      and(eq(personContactLinks.organizationId, organizationId), eq(personContactLinks.personId, personId)),
    )
    .limit(1);
  if (!verify) {
    throw new Error("person_contact_links row missing after insert");
  }
  return { contactId: verify.contactId, created: insertedNewContact };
}

export const LEGACY_BRIDGE_MAX_PERSON_IDS = 500;
export const LEGACY_BRIDGE_BATCH_SIZE = 100;

export type LegacyContactMapping = { personId: string; contactId: number; created: boolean };

/**
 * Batch wrapper around `ensureLegacyContactForPerson` (max 500 ids per call).
 */
export async function ensureLegacyContactsForPeople(params: {
  organizationId: number;
  personIds: bigint[];
}): Promise<LegacyContactMapping[]> {
  if (params.personIds.length > LEGACY_BRIDGE_MAX_PERSON_IDS) {
    throw new Error(`At most ${LEGACY_BRIDGE_MAX_PERSON_IDS} person ids per call`);
  }
  const out: LegacyContactMapping[] = [];
  for (let i = 0; i < params.personIds.length; i += LEGACY_BRIDGE_BATCH_SIZE) {
    const chunk = params.personIds.slice(i, i + LEGACY_BRIDGE_BATCH_SIZE);
    for (const personId of chunk) {
      const r = await ensureLegacyContactForPerson({ organizationId: params.organizationId, personId });
      out.push({ personId: String(personId), contactId: r.contactId, created: r.created });
    }
  }
  return out;
}

/**
 * Ensures legacy contacts exist for the given people. Returns `contactIds` for use with existing
 * enrollment APIs. `campaignId` is reserved for future wiring; this helper does not enroll.
 */
export async function preparePeopleForCampaign(params: {
  organizationId: number;
  personIds: bigint[];
  campaignId?: number;
}): Promise<{ contactIds: number[]; mappings: LegacyContactMapping[] }> {
  void params.campaignId;
  const mappings = await ensureLegacyContactsForPeople({
    organizationId: params.organizationId,
    personIds: params.personIds,
  });
  const contactIds = mappings.map(m => m.contactId);
  return { contactIds, mappings };
}
