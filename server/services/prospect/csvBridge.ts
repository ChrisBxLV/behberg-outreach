// CSV import bridge.
//
// When a user uploads contacts via CSV, we forward the (company, domain,
// linkedin) hints into the prospect database so the autonomous crawler can
// learn from them. Imports never overwrite the per-tenant `contacts` table —
// this is a passive enrichment hook only.

import { rootDomainOnly } from "../prospectingV1Utils";
import { upsertCompany, upsertEmployee, enqueueJobs, sanitizeLinkedinPersonUrl } from "./repository";

export type CsvBridgeContact = {
  email?: string | null;
  /** "valid"/"verified" rows from the CSV — caller has already confirmed deliverability. */
  emailVerified?: boolean;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  company?: string | null;
  companyWebsite?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
};

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
]);

function deriveDomain(input: CsvBridgeContact): string | null {
  if (input.companyWebsite) {
    try {
      const u = new URL(/^https?:\/\//.test(input.companyWebsite) ? input.companyWebsite : `https://${input.companyWebsite}`);
      return rootDomainOnly(u.hostname.toLowerCase().replace(/^www\./i, ""));
    } catch {
      // ignore
    }
  }
  if (input.email && input.email.includes("@")) {
    const domain = input.email.slice(input.email.indexOf("@") + 1).trim().toLowerCase();
    if (domain && !FREE_MAIL_DOMAINS.has(domain)) {
      return rootDomainOnly(domain);
    }
  }
  return null;
}

/**
 * Quietly enrich the prospect database with rows the user just imported.
 * Errors are caught and logged so that CSV import never fails because of the
 * bridge.
 */
export async function bridgeCsvImportToProspectDb(contacts: CsvBridgeContact[]): Promise<void> {
  for (const contact of contacts) {
    try {
      const domain = deriveDomain(contact);
      const company = (contact.company ?? "").trim();
      if (!company) continue;
      const upserted = await upsertCompany({
        name: company,
        domain,
        source: "user_import",
      });
      if (!upserted) continue;
      // Enqueue follow-up jobs for the company even when the row doesn't
      // include a valid person record (bootstrap company-only imports).
      const followups: Array<Parameters<typeof enqueueJobs>[0][number]> = [];
      if (!upserted.company.domain && !domain) {
        followups.push({
          kind: "resolve_domain",
          payload: { companyId: upserted.company.id },
          priority: 1,
        });
      } else if (!upserted.company.domain && domain) {
        followups.push({
          kind: "crawl_website",
          payload: { companyId: upserted.company.id },
          priority: 2,
        });
      }

      const fullName = (contact.fullName ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`).trim();
      let employee: Awaited<ReturnType<typeof upsertEmployee>> = null;
      if (fullName && fullName.split(/\s+/g).length >= 2) {
        const linkedinUrl = sanitizeLinkedinPersonUrl(contact.linkedinUrl ?? null);
        employee = await upsertEmployee({
          companyId: upserted.company.id,
          companyDomainHint: domain,
          companyNameHint: company,
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          fullName,
          title: contact.title ?? null,
          linkedinUrl,
          emailHint: contact.email ?? null,
          emailHintVerified: contact.emailVerified === true,
          source: "user_import",
        });
        if (employee && !employee.email && employee.emailStatus === "unknown") {
          followups.push({
            kind: "guess_emails",
            payload: { employeeId: employee.id },
            priority: 2,
          });
        }
      }
      if (followups.length) await enqueueJobs(followups);
    } catch (err: any) {
      console.warn(`[ProspectCsvBridge] row failed:`, err?.message ?? err);
    }
  }
}
