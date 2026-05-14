import type { Company, Person } from "../../drizzle/schema";

/**
 * Pure JSON shapes for a future Elasticsearch/OpenSearch indexer.
 * A future Elastic/OpenSearch worker should index these documents (bulk upsert by id).
 * Do not add network calls or Elastic clients here.
 *
 * Never put OAuth tokens, mailbox credentials, or other secrets into these documents.
 */

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

export function buildPersonSearchDocument(
  person: Person,
  company: Company | null,
): Record<string, unknown> {
  return {
    personId: String(person.id),
    organizationId: person.organizationId,
    companyId: person.companyId != null ? String(person.companyId) : null,
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: person.fullName,
    title: person.title,
    titleNormalized: person.titleNormalized,
    seniorityLevel: person.seniorityLevel,
    department: person.department,
    email: person.email,
    emailDomain: person.emailDomain,
    emailStatus: person.emailStatus,
    linkedinUrl: person.linkedinUrl,
    country: person.country,
    city: person.city,
    source: person.source,
    confidence: person.confidence,
    createdAt: iso(person.createdAt),
    updatedAt: iso(person.updatedAt),
    lastVerifiedAt: iso(person.lastVerifiedAt ?? undefined),
    lastEnrichedAt: iso(person.lastEnrichedAt ?? undefined),
    company: company
      ? {
          id: String(company.id),
          name: company.name,
          domain: company.domain,
          website: company.website,
          linkedinUrl: company.linkedinUrl,
          industry: company.industry,
          companySize: company.companySize,
          headcount: company.headcount,
          country: company.country,
          city: company.city,
        }
      : null,
  };
}

export function buildCompanySearchDocument(company: Company): Record<string, unknown> {
  return {
    companyId: String(company.id),
    organizationId: company.organizationId,
    name: company.name,
    nameNormalized: company.nameNormalized,
    domain: company.domain,
    website: company.website,
    linkedinUrl: company.linkedinUrl,
    industry: company.industry,
    companySize: company.companySize,
    headcount: company.headcount,
    country: company.country,
    city: company.city,
    source: company.source,
    confidence: company.confidence,
    createdAt: iso(company.createdAt),
    updatedAt: iso(company.updatedAt),
    lastEnrichedAt: iso(company.lastEnrichedAt ?? undefined),
  };
}
