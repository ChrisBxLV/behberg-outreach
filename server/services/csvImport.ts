import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import { createContact, createImportBatch, updateImportBatch } from "../db";
import type { InsertContact } from "../../drizzle/schema";

// Apollo CSV column name mappings (handles various export formats)
const FIELD_MAP: Record<string, keyof InsertContact> = {
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
  // Professional
  "title": "title",
  "job title": "title",
  "position": "title",
  "company": "company",
  "company name": "company",
  "organization": "company",
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
  "country": "location",
  // Apollo specific
  "email confidence": "emailConfidence",
  "email status": "emailStatus",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]/g, " ");
}

function mapEmailStatus(raw: string): InsertContact["emailStatus"] {
  const v = raw?.toLowerCase().trim();
  if (v === "valid" || v === "verified") return "valid";
  if (v === "invalid") return "invalid";
  if (v === "catch_all" || v === "catch all") return "catch_all";
  if (v === "risky" || v === "accept all") return "risky";
  return "unknown";
}

export interface ImportResult {
  batchId: string;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importCsvContacts(
  csvBuffer: Buffer,
  filename: string
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
      };

      // Map columns
      for (const [rawKey, value] of Object.entries(row)) {
        const normalized = normalizeHeader(rawKey);
        const field = FIELD_MAP[normalized];
        if (!field || !value) continue;

        if (field === "emailConfidence") {
          const num = parseFloat(value);
          if (!isNaN(num)) contact.emailConfidence = num > 1 ? num / 100 : num;
        } else if (field === "emailStatus") {
          contact.emailStatus = mapEmailStatus(value);
        } else {
          (contact as any)[field] = value.trim();
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
        skipped++;
        continue;
      }

      await createContact(contact);
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
