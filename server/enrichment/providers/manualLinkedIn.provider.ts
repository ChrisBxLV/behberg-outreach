import type { EnrichmentField, EnrichmentInput, EnrichmentProvider } from "../enrichment.types";

function isLinkedInHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "linkedin.com" || h.endsWith(".linkedin.com");
}

function normalizeLinkedInUrl(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase();
    if (!isLinkedInHost(host)) return null;
    const path = u.pathname.replace(/\/+$/g, "");
    const ok =
      /^\/in\/[A-Za-z0-9_-]+$/i.test(path) ||
      /^\/company\/[A-Za-z0-9_-]+$/i.test(path);
    if (!ok) return null;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export class ManualLinkedInProvider implements EnrichmentProvider {
  name = "manual_linkedin";

  async enrich(input: EnrichmentInput): Promise<EnrichmentField[]> {
    const url = input.linkedinUrl ? normalizeLinkedInUrl(input.linkedinUrl) : null;
    if (!url) return [];
    return [
      {
        source: "manual",
        fieldName: "linkedinUrl",
        fieldValue: url,
        confidence: 100,
        personalData: true,
        rawData: { note: "Manual reference only; not fetched." },
      },
    ];
  }
}

export function validateLinkedInUrlForManualStorage(raw: string): string | null {
  return normalizeLinkedInUrl(raw);
}

