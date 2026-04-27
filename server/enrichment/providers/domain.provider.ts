import type { EnrichmentField, EnrichmentInput, EnrichmentProvider } from "../enrichment.types";
import { isBlockedCompanyWebsiteHost } from "../hostBlocklist";

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "yandex.com",
  "yandex.ru",
]);

function normalizeDomainFromUrl(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host) return null;
    return host;
  } catch {
    return null;
  }
}

function normalizeDomainFromEmail(raw: string): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 0) return null;
  const domain = value.slice(at + 1).trim();
  if (!domain) return null;
  return domain.replace(/^\[|\]$/g, "");
}

function looksLikePersonalEmailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return PERSONAL_EMAIL_DOMAINS.has(d);
}

function websiteUrlFromDomain(domain: string): string {
  return `https://${domain}`;
}

export class DomainProvider implements EnrichmentProvider {
  name = "domain";

  async enrich(input: EnrichmentInput): Promise<EnrichmentField[]> {
    const fields: EnrichmentField[] = [];

    const byWebsite = input.companyWebsite ? normalizeDomainFromUrl(input.companyWebsite) : null;
    const byEmail = input.email ? normalizeDomainFromEmail(input.email) : null;

    let candidate: string | null = null;
    if (byWebsite && !isBlockedCompanyWebsiteHost(byWebsite)) {
      candidate = byWebsite;
    } else if (byEmail && !looksLikePersonalEmailDomain(byEmail)) {
      candidate = byEmail;
    } else if (byWebsite && isBlockedCompanyWebsiteHost(byWebsite) && byEmail && !looksLikePersonalEmailDomain(byEmail)) {
      candidate = byEmail;
    }

    if (!candidate) return fields;
    if (looksLikePersonalEmailDomain(candidate)) return fields;

    const derivedFrom =
      byWebsite && !isBlockedCompanyWebsiteHost(byWebsite) ? "companyWebsite" : "email";

    fields.push({
      source: "domain",
      fieldName: "normalizedDomain",
      fieldValue: candidate,
      confidence: derivedFrom === "companyWebsite" ? 90 : 70,
      personalData: false,
      rawData: { derivedFrom },
    });

    fields.push({
      source: "domain",
      fieldName: "possibleWebsiteUrl",
      fieldValue: websiteUrlFromDomain(candidate),
      confidence: 70,
      personalData: false,
      rawData: { derivedFrom: "normalizedDomain" },
    });

    return fields;
  }
}

