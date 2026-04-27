import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import { upsertContact, createImportBatch, updateImportBatch } from "../db";
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

function guessFieldFromHeader(normalized: string): CsvMappedField | null {
  const h = normalized;
  if (!h) return null;

  // Heuristics for unknown exports (kept conservative).
  if (h.includes("email")) return "email";
  if (h.includes("linkedin")) return "linkedinUrl";
  if (h.includes("website") || h.includes("url") || h.includes("domain")) return "companyWebsite";
  if (h.includes("company") || h.includes("organization") || h.includes("account")) return "company";
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

export interface ImportResult {
  batchId: string;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
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
          (contact as any)[field] = value.trim();
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

      await upsertContact(contact);
      imported++;
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

  return { batchId, total, imported, skipped, errors };
}
