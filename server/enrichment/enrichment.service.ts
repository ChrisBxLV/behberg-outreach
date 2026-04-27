import type { EnrichmentField, EnrichmentInput, EnrichmentProvider } from "./enrichment.types";
import { DomainProvider } from "./providers/domain.provider";
import { ManualLinkedInProvider } from "./providers/manualLinkedIn.provider";
import { TechDetectorProvider } from "./providers/techDetector.provider";
import { WebsiteProvider, extractWebsiteHtmlRawData } from "./providers/website.provider";

export type EnrichmentRunResult = {
  normalizedDomain: string | null;
  fields: EnrichmentField[];
};

function dedupeFields(fields: EnrichmentField[]): EnrichmentField[] {
  const seen = new Set<string>();
  const out: EnrichmentField[] = [];
  for (const f of fields) {
    const key = `${f.source}|${f.fieldName}|${f.fieldValue}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeFields(fields: EnrichmentField[]): EnrichmentField[] {
  return fields
    .filter(f => f.fieldName && f.fieldValue)
    .map(f => ({
      ...f,
      confidence: clampConfidence(f.confidence),
      fieldName: String(f.fieldName).slice(0, 128),
      fieldValue: String(f.fieldValue).slice(0, 20_000),
    }));
}

function asNormalizedDomain(fields: EnrichmentField[]): string | null {
  const f = fields.find(x => x.source === "domain" && x.fieldName === "normalizedDomain");
  return f ? String(f.fieldValue) : null;
}

function chooseWebsiteUrl(input: EnrichmentInput, domainFields: EnrichmentField[]): string | null {
  if (input.companyWebsite && input.companyWebsite.trim()) return input.companyWebsite.trim();
  const possible = domainFields.find(x => x.source === "domain" && x.fieldName === "possibleWebsiteUrl");
  return possible ? String(possible.fieldValue) : null;
}

export async function enrichContactMvp(input: EnrichmentInput): Promise<EnrichmentRunResult> {
  const domainProvider = new DomainProvider();
  const manualProvider = new ManualLinkedInProvider();

  // Domain pass first (no network)
  const domainFields = await domainProvider.enrich(input);

  // Website pass (safe fetch)
  const websiteUrl = chooseWebsiteUrl(input, domainFields);
  const websiteProvider = new WebsiteProvider();
  const websiteFieldsRaw = websiteUrl
    ? await websiteProvider.enrich({ ...input, companyWebsite: websiteUrl })
    : [];

  // Tech detection based on fetched HTML (no network)
  const html = extractWebsiteHtmlRawData(websiteFieldsRaw);
  const techProvider = new TechDetectorProvider(() => html);
  const techFields = await techProvider.enrich(input);

  // Do not persist full HTML blobs in rawData. Keep only a small summary.
  const websiteFields = websiteFieldsRaw.map(f => {
    if (f.source !== "website" || f.fieldName !== "websiteFetch") return f;
    const raw: any = f.rawData;
    const htmlRaw = raw?.html;
    if (typeof htmlRaw !== "string") return f;
    const { html: _omit, ...rest } = raw;
    return {
      ...f,
      rawData: {
        ...rest,
        htmlBytes: Buffer.byteLength(htmlRaw, "utf8"),
        note: "HTML not stored (used transiently for tech detection).",
      },
    };
  });

  // Manual LinkedIn reference (no network)
  const manualFields = await manualProvider.enrich(input);

  const providers: Array<{ provider: EnrichmentProvider; fields: EnrichmentField[] }> = [
    { provider: domainProvider, fields: domainFields },
    { provider: websiteProvider, fields: websiteFields },
    { provider: techProvider, fields: techFields },
    { provider: manualProvider, fields: manualFields },
  ];

  const all = dedupeFields(
    sanitizeFields(
      providers.flatMap(p => p.fields),
    ),
  );

  const normalizedDomain = asNormalizedDomain(domainFields);
  return { normalizedDomain, fields: all };
}

