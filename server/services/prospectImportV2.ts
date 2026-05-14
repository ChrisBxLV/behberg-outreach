/**
 * Prospect v2 (Apollo-like) import: per-tenant `companies`, `people`, and `crm_contacts`.
 *
 * Legacy `contacts` still power the current CRM UI and campaigns; this module is the
 * new source for search/import. A future migration can map `people` / `crm_contacts`
 * into campaign enrollment once flows are updated.
 */

import type { InsertContact, Person } from "../../drizzle/schema";
import type { CsvBridgeContact } from "./prospect/csvBridge";
import {
  buildContactDraftFromCsvRow,
  normalizeHeader,
} from "./csvImport";
import {
  createOrUpdateCrmContact,
  normalizeDomain,
  normalizeEmail,
  upsertCompanyForOrganization,
  upsertPersonForOrganization,
} from "../prospectDb";

function pickFirstColumnValue(row: Record<string, string>, normalizedHeader: string): string | null {
  for (const [rawKey, value] of Object.entries(row)) {
    if (normalizeHeader(rawKey) === normalizedHeader && value?.trim()) {
      return value.trim();
    }
  }
  return null;
}

function mapContactEmailStatusToPerson(
  s: InsertContact["emailStatus"] | undefined,
): Person["emailStatus"] {
  switch (s) {
    case "valid":
      return "valid";
    case "invalid":
      return "invalid";
    case "catch_all":
      return "catch_all";
    case "risky":
      return "risky";
    default:
      return "unknown";
  }
}

function deriveCompanyName(contact: InsertContact): string {
  const trimmed = contact.company?.trim();
  if (trimmed) return trimmed;
  const dom = contact.normalizedDomain?.trim();
  if (dom) {
    const label = dom.split(".")[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : dom;
  }
  if (contact.companyWebsite?.trim()) {
    try {
      const u = new URL(/^https?:\/\//.test(contact.companyWebsite) ? contact.companyWebsite : `https://${contact.companyWebsite}`);
      return u.hostname.replace(/^www\./i, "") || "Unknown company";
    } catch {
      // ignore
    }
  }
  return "Unknown company";
}

export type ImportProspectsV2FromCsvRowsInput = {
  organizationId: number;
  rows: Record<string, string>[];
  importBatchId: string;
  /** Stored on rows (e.g. `csv_import`, `api_sync`). */
  source?: string;
};

export type ImportProspectsV2FromCsvRowsResult = {
  importedRows: number;
  skippedRows: number;
  errors: string[];
  /** Hints for the legacy global prospect crawler (`bridgeCsvImportToProspectDb`). */
  bridgeHints: CsvBridgeContact[];
};

/**
 * Import parsed CSV rows into MySQL prospect v2 tables (`companies`, `people`, `crm_contacts`).
 * Dedupe uses non-null normalized email/domain/LinkedIn only (MySQL UNIQUE allows multiple NULLs).
 */
export async function importProspectsV2FromCsvRows(
  input: ImportProspectsV2FromCsvRowsInput,
): Promise<ImportProspectsV2FromCsvRowsResult> {
  const errors: string[] = [];
  let importedRows = 0;
  let skippedRows = 0;
  const bridgeHints: CsvBridgeContact[] = [];
  const orgId = input.organizationId;
  const importBatchId = input.importBatchId;
  const source = input.source ?? "csv_import";

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    try {
      const { contact, mappedAny, companyLinkedinUrl } = buildContactDraftFromCsvRow(
        row,
        orgId,
        importBatchId,
      );

      const personCity =
        pickFirstColumnValue(row, "city") ||
        pickFirstColumnValue(row, "person city") ||
        pickFirstColumnValue(row, "hq city");
      const personCountry =
        pickFirstColumnValue(row, "country") ||
        pickFirstColumnValue(row, "person country") ||
        pickFirstColumnValue(row, "hq country");

      const companyName = deriveCompanyName(contact);
      const explicitDomain = contact.normalizedDomain?.trim() || null;
      const domainForCompany = normalizeDomain(explicitDomain) ?? normalizeDomain(contact.companyWebsite ?? undefined);

      const companyId = await upsertCompanyForOrganization({
        organizationId: orgId,
        name: companyName,
        domain: domainForCompany ?? normalizeDomain(explicitDomain ?? undefined),
        website: contact.companyWebsite ?? null,
        linkedinUrl: companyLinkedinUrl?.trim() || null,
        industry: contact.industry ?? null,
        companySize: contact.companySize ?? null,
        country: pickFirstColumnValue(row, "company country") || pickFirstColumnValue(row, "hq country"),
        city: pickFirstColumnValue(row, "company city") || pickFirstColumnValue(row, "hq city"),
        source,
        lastEnrichedAt: new Date(),
      });

      const emailNorm = normalizeEmail(contact.email ?? undefined);
      const linkedinTrim = contact.linkedinUrl?.trim() || null;
      const fullName = contact.fullName?.trim() || null;

      const hasPersonKey = Boolean(emailNorm || linkedinTrim || (fullName && companyId != null));

      if (!hasPersonKey) {
        if (!mappedAny) {
          const headers = Object.keys(row)
            .slice(0, 12)
            .map(k => normalizeHeader(k))
            .filter(Boolean)
            .join(", ");
          errors.push(`Row ${i + 2}: no recognized columns (headers: ${headers || "unknown"})`);
        }
        if (companyId != null) importedRows += 1;
        else skippedRows += 1;
        bridgeHints.push({
          email: contact.email ?? null,
          emailVerified: contact.emailStatus === "valid",
          fullName: contact.fullName ?? null,
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          title: contact.title ?? null,
          company: contact.company ?? null,
          companyWebsite: contact.companyWebsite ?? null,
          linkedinUrl: contact.linkedinUrl ?? null,
          location: contact.location ?? null,
        });
        continue;
      }

      const personId = await upsertPersonForOrganization({
        organizationId: orgId,
        companyId: companyId ?? undefined,
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        fullName,
        title: contact.title ?? null,
        email: contact.email ?? null,
        emailStatus: mapContactEmailStatusToPerson(contact.emailStatus),
        linkedinUrl: linkedinTrim,
        country: personCountry ?? null,
        city: personCity ?? null,
        source,
        lastEnrichedAt: new Date(),
      });

      if (personId != null) {
        await createOrUpdateCrmContact({
          organizationId: orgId,
          personId,
          stage: "new",
          tags: contact.tags ?? undefined,
          importBatchId,
        });
        importedRows++;
      } else {
        skippedRows++;
      }

      bridgeHints.push({
        email: contact.email ?? null,
        emailVerified: contact.emailStatus === "valid",
        fullName: contact.fullName ?? null,
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        title: contact.title ?? null,
        company: contact.company ?? null,
        companyWebsite: contact.companyWebsite ?? null,
        linkedinUrl: contact.linkedinUrl ?? null,
        location: contact.location ?? null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${i + 2}: ${msg}`);
      skippedRows++;
    }
  }

  return { importedRows, skippedRows, errors, bridgeHints };
}
