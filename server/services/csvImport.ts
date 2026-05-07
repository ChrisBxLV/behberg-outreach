import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import {
  createImportBatch,
  createOrMergeContact,
  updateImportBatch,
} from "../db";
import { bridgeCsvImportToProspectDb } from "./prospect/csvBridge";
import type { InsertContact } from "../../drizzle/schema";

type CsvMappedField = keyof InsertContact | "__country" | "__keywords";

// Apollo CSV column name mappings (handles various export formats)
const FIELD_MAP: Record<string, CsvMappedField> = {
  // Name variants
  "first name": "firstName",
  "firstname": "firstName",
  "first_name": "firstName",
  "last name": "lastName",
  "lastname": "lastName",
  "last_name": "lastName",
  "name": "fullName",
  "full name": "fullName",
  "contact name": "fullName",
  // Email
  "email": "email",
  "email address": "email",
  "work email": "email",
  "corporate email": "email",
  "email 1": "email",
  "primary email": "email",
  // Professional
  "title": "title",
  "job title": "title",
  "position": "title",
  "company": "company",
  "company name": "company",
  "organization": "company",
  "account": "company",
  "account name": "company",
  "company/organization": "company",
  "industry": "industry",
  "company size": "companySize",
  "employees": "companySize",
  "website": "companyWebsite",
  "company website": "companyWebsite",
  "company url": "companyWebsite",
  // LinkedIn
  "linkedin url": "linkedinUrl",
  "linkedin": "linkedinUrl",
  "profile url": "linkedinUrl",
  // Location
  "location": "location",
  "city": "location",
  "country": "__country",
  // Phone
  "phone": "phone",
  "work direct phone": "phone",
  "work phone": "phone",
  "mobile phone": "phone",
  "corporate phone": "phone",
  // Keywords / tags
  "keyword": "__keywords",
  "keywords": "__keywords",
  "custom keyword": "__keywords",
  "custom keywords": "__keywords",
  "tags": "__keywords",
  // Apollo specific
  "email confidence": "emailConfidence",
  "email status": "emailStatus",
};

function normalizeHeader(h: string): string {
  // Strip UTF-8 BOM and normalize whitespace/separators (Excel/Sheets exports often include these).
  return h
    .replace(/^\uFEFF/, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .trim()
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ");
}

/** True if the header is probably the mailbox column, not a boolean/status (e.g. "Has Email" → false). */
function isLikelyEmailAddressColumnName(h: string): boolean {
  if (!h.includes("email")) return true;
  if (h.startsWith("has ") || h.startsWith("had ")) return false;
  if (/\bhas\s+work\s+email\b|\bhad\s+work\s+email\b|\bhas\s+email\b|\bhad\s+email\b/.test(h)) return false;
  // "Work email verified", "Email status" (handled in FIELD_MAP), etc.
  if (
    /\b(work|primary|personal|corporate|company|business)\s+email\s+(verified|valid|confirmed|present|found|exists?|active|inactive|missing|unknown)\b/i.test(h)
  ) {
    return false;
  }
  if (/\bemail\s+(verified|valid|confirmed|active|inactive|present|exists?|found|missing|unknown|status|quality|score|grade|bounce|open|click|sent|reply|sentiment)\b/i.test(h)) {
    return false;
  }
  if (/\bemail\s+(1|2|3|4)\b/.test(h)) return true; // "email 1" variants
  if (/\b(confidence|risk score|guess|tier|grade)\b/i.test(h) && h.includes("email")) return false;
  return true;
}

function guessFieldFromHeader(normalized: string): CsvMappedField | null {
  const h = normalized;
  if (!h) return null;

  // Never guess-map internal identifiers (Apollo exports include lots of "... Id" columns).
  // These often contain 24-char hex IDs and should not populate name/company/email fields.
  if (h.includes("apollo ") || /\bid\b/.test(h) || h.endsWith(" id")) {
    return null;
  }

  // Avoid mis-mapping phone/address/location metadata into company/name fields.
  if (h.includes("phone") || h.includes("fax")) return null;
  if (h.includes("address")) return null;
  if (h.includes("company ") && (h.includes(" city") || h.includes(" state") || h.includes(" country"))) return null;

  // Heuristics for unknown exports (kept conservative).
  if (h.includes("email")) {
    if (!isLikelyEmailAddressColumnName(h)) return null;
    return "email";
  }
  if (h.includes("linkedin")) return "linkedinUrl";
  if (h.includes("website") || h.includes("url") || h.includes("domain")) return "companyWebsite";
  // Note: don't guess-map "account" → company. Many exports include "account owner" which is an email
  // and would incorrectly become the company value for every row.
  if (h.includes("company") || h.includes("organization")) return "company";
  if (h.includes("job title") || h === "title" || h.includes("position")) return "title";

  // Name columns: prefer explicit first/last; otherwise treat "name" as full name.
  if (h.includes("first name") || h === "firstname") return "firstName";
  if (h.includes("last name") || h === "lastname") return "lastName";
  if (h.endsWith(" name") || h === "name") return "fullName";

  // Country / tags
  if (h === "country") return "__country";
  if (h.includes("keyword") || h.includes("tag")) return "__keywords";

  return null;
}

function mapEmailStatus(raw: string): InsertContact["emailStatus"] {
  const v = raw?.toLowerCase().trim();
  if (v === "valid" || v === "verified") return "valid";
  if (v === "invalid") return "invalid";
  if (v === "catch_all" || v === "catch all") return "catch_all";
  if (v === "risky" || v === "accept all") return "risky";
  return "unknown";
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(/[;,|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProbablyEmail(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  // Guard against common mis-maps (timestamps/UUIDs/etc). Keep permissive but require '@' + a dot later.
  if (!v.includes("@")) return false;
  if (v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function looksLikeId(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  // Mongo ObjectId / Apollo-ish IDs
  if (/^[0-9a-f]{24}$/i.test(v)) return true;
  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  // Pure numeric identifiers
  if (/^\d{6,}$/.test(v)) return true;
  return false;
}

function looksLikePhone(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  // Allow "+", spaces, hyphens, parentheses; require enough digits.
  if (!/^[+()\-\s.\d]+$/.test(v)) return false;
  const digits = (v.match(/\d/g) ?? []).length;
  return digits >= 7;
}

export interface ImportResult {
  batchId: string;
  total: number;
  /** New contacts inserted into the database */
  imported: number;
  /** Rows with parse/validation failures */
  skipped: number;
  /** Rows that matched an existing contact (same email / LinkedIn / fuzzy duplicate rules); DB row was not updated */
  matchedExisting: number;
  /** Distinct database contact IDs that CSV rows matched (already on the dashboard) */
  matchedContactIds: number[];
  errors: string[];
  /** Debug-only mapping info (no row values). */
  debug?: {
    organizationId: number | null;
    detectedHeaders: string[];
    sampleHeaderMapping: Partial<Record<"email" | "company" | "fullName" | "linkedinUrl", string>>;
  };
}

type ImportCsvOptions = {
  organizationId?: number | null;
};

export async function importCsvContacts(
  csvBuffer: Buffer,
  filename: string,
  options: ImportCsvOptions = {},
): Promise<ImportResult> {
  const batchId = uuidv4();
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  let matchedExisting = 0;
  const matchedContactIdSet = new Set<number>();
  const debug: ImportResult["debug"] = {
    organizationId: options.organizationId ?? null,
    detectedHeaders: [],
    sampleHeaderMapping: {},
  };

  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err: any) {
    throw new Error(`CSV parse error: ${err.message}`);
  }

  const total = records.length;
  await createImportBatch({ batchId, filename, totalRows: total });
  // Capture (company, domain, person) hints we observed so the autonomous
  // prospect crawler can enrich this universe in the background. Sent after
  // the loop so an LLM-free hand-off never blocks the user-facing import.
  const prospectBridgeQueue: Parameters<typeof bridgeCsvImportToProspectDb>[0] = [];

  if (records[0]) {
    debug.detectedHeaders = Object.keys(records[0])
      .map((k) => normalizeHeader(k))
      .filter(Boolean);
  }

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    try {
      const contact: InsertContact = {
        source: "csv_import",
        importBatchId: batchId,
        stage: "new",
        emailStatus: "unknown",
        tags: [],
        organizationId: options.organizationId ?? null,
      };
      let csvCountry = "";
      let mappedAny = false;
      const headerUsed: Partial<Record<"email" | "company" | "fullName" | "linkedinUrl", string>> = {};

      // Map columns
      for (const [rawKey, value] of Object.entries(row)) {
        const normalized = normalizeHeader(rawKey);
        const field = FIELD_MAP[normalized] ?? guessFieldFromHeader(normalized);
        if (!field || !value) continue;
        mappedAny = true;

        if (field === "emailConfidence") {
          const num = parseFloat(value);
          if (!isNaN(num)) contact.emailConfidence = num > 1 ? num / 100 : num;
        } else if (field === "emailStatus") {
          contact.emailStatus = mapEmailStatus(value);
        } else if (field === "__country") {
          csvCountry = value.trim();
        } else if (field === "__keywords") {
          const parsed = splitKeywords(value);
          const existing = contact.tags ?? [];
          contact.tags = Array.from(new Set([...existing, ...parsed]));
        } else {
          const v = value.trim();
          if (
            field === "email" &&
            /^(true|false|yes|no)$/i.test(v) &&
            v.length <= 5
          ) {
            continue; // boolean export column mis-mapped to email (e.g. "Has Email")
          }
          if (field === "email" && !isProbablyEmail(v)) {
            // If a non-email value lands in the email column, it causes all rows to collapse into one "duplicate".
            // Treat it as absent and let other identifiers (name/company/linkedin) drive matching/creation.
            continue;
          }
          if (field === "company" && isProbablyEmail(v)) {
            // Avoid setting company to an owner email ("Account Owner", etc).
            continue;
          }
          if (field === "company" && looksLikePhone(v)) {
            // Avoid setting company to phone numbers ("Company Phone", etc).
            continue;
          }
          if (field === "phone") {
            // Prefer the first non-empty phone we see (CSV exports often include multiple phone columns).
            if (!contact.phone && looksLikePhone(v)) {
              contact.phone = v;
            }
            continue;
          }
          if ((field === "company" || field === "companyWebsite") && looksLikeId(v)) {
            // Some exports put internal IDs in "Company" columns; don't store them as a company name.
            continue;
          }
          if ((field === "email" || field === "company" || field === "fullName" || field === "linkedinUrl") && !headerUsed[field]) {
            headerUsed[field] = normalized;
          }
          (contact as any)[field] = v;
        }
      }

      if (csvCountry) {
        const currentLocation = contact.location?.trim();
        if (!currentLocation) {
          contact.location = csvCountry;
        } else if (!currentLocation.toLowerCase().includes(csvCountry.toLowerCase())) {
          contact.location = `${currentLocation}, ${csvCountry}`;
        }
      }

      // Build fullName from parts if not present
      if (!contact.fullName && (contact.firstName || contact.lastName)) {
        contact.fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
      }

      // Determine enrichment stage
      if (contact.email && contact.emailStatus !== "invalid") {
        contact.stage = "enriched";
        if (!contact.emailStatus || contact.emailStatus === "unknown") {
          contact.emailStatus = contact.emailConfidence && contact.emailConfidence > 0.7 ? "valid" : "risky";
        }
      }

      // Skip if no identifying info
      if (!contact.email && !contact.fullName && !contact.company) {
        if (!mappedAny) {
          const headers = Object.keys(row)
            .slice(0, 12)
            .map(k => normalizeHeader(k))
            .filter(Boolean)
            .join(", ");
          errors.push(`Row ${i + 2}: no recognized columns (headers: ${headers || "unknown"})`);
        }
        skipped++;
        continue;
      }

      const upsert = await createOrMergeContact(contact);
      if (upsert.action === "merged") {
        matchedExisting++;
        matchedContactIdSet.add(upsert.contact.id);
      } else {
        imported++;
      }

      prospectBridgeQueue.push({
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

      if (i === 0) {
        debug.sampleHeaderMapping = headerUsed;
      }
    } catch (err: any) {
      errors.push(`Row ${i + 2}: ${err.message}`);
      skipped++;
    }
  }

  await updateImportBatch(batchId, {
    importedRows: imported,
    skippedRows: skipped,
    status: errors.length > 0 && imported === 0 ? "failed" : "completed",
    errorLog: errors.length > 0 ? errors.slice(0, 20).join("\n") : undefined,
  });

  // Fire-and-forget hand-off to the prospect database. Failures must never
  // affect the user-visible CSV import result.
  void bridgeCsvImportToProspectDb(prospectBridgeQueue).catch((err: any) => {
    console.warn(`[CSV Import] prospect bridge failed:`, err?.message ?? err);
  });

  return {
    batchId,
    total,
    imported,
    skipped,
    matchedExisting,
    matchedContactIds: Array.from(matchedContactIdSet).sort((a, b) => a - b),
    errors,
    debug,
  };
}
