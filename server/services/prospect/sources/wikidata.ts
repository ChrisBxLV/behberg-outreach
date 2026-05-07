// Wikidata SPARQL seed adapter.
//
// Strategy: per-region SPARQL query that returns up-to-50 instances of
// `Q4830453` (business) located in the requested country/state with HQ city,
// official website, and (when present) industry label and LinkedIn URL.
// Wikidata is free, structured, and politely rate-limits to ~1 query / 3s.

import { safeFetch } from "../safeFetch";
import { findIndustryByCode } from "../industryTaxonomy";
import { classifyIndustry } from "../industryClassifier";
import type { CompanyDraft, SeedAdapter, SeedRunInput, SeedRunResult } from "../types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

function buildSparql(qid: string, limit: number): string {
  // Fields:
  //   ?company        (entity id)
  //   ?companyLabel
  //   ?websiteRaw     (P856)
  //   ?cityLabel      (HQ city: P159 -> P276 location)
  //   ?countryLabel   (HQ country: P159 -> P17)
  //   ?industryLabel  (P452)
  //   ?linkedinUserName (P4264)
  return `
SELECT ?company ?companyLabel ?websiteRaw ?cityLabel ?countryCode ?industryLabel ?linkedinUserName
WHERE {
  ?company wdt:P31/wdt:P279* wd:Q4830453 .
  ?company wdt:P159 ?hq .
  ?hq wdt:P131*|wdt:P17 wd:${qid} .
  OPTIONAL { ?company wdt:P856 ?websiteRaw . }
  OPTIONAL { ?company wdt:P159 ?city . ?city rdfs:label ?cityLabel FILTER (lang(?cityLabel)="en") }
  OPTIONAL { ?company wdt:P17 ?country . ?country wdt:P297 ?countryCode . }
  OPTIONAL { ?company wdt:P452 ?industry . ?industry rdfs:label ?industryLabel FILTER (lang(?industryLabel)="en") }
  OPTIONAL { ?company wdt:P4264 ?linkedinUserName . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`.trim();
}

type SparqlBinding = {
  type: string;
  value: string;
};
type SparqlResponse = {
  head?: { vars?: string[] };
  results?: { bindings?: Record<string, SparqlBinding>[] };
};

function decodeWikidataDomain(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export const wikidataSeedAdapter: SeedAdapter = {
  kind: "wikidata_region",
  async run(input: SeedRunInput): Promise<SeedRunResult> {
    const payload = input.payload ?? {};
    const qid = (payload.wikidataQid as string | null) ?? null;
    const countryCode = (payload.countryCode as string | null) ?? null;
    const admin1 = (payload.admin1 as string | null) ?? null;
    if (!qid) return { companies: [], employees: [] };

    const sparql = buildSparql(qid, 50);
    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await safeFetch(url, {
      accept: "application/sparql-results+json",
      timeoutMs: 15_000,
      maxBytes: 2_000_000,
      skipThrottle: false,
    });
    if (!res) return { companies: [], employees: [], throttled: true };

    let parsed: SparqlResponse | null = null;
    try {
      parsed = JSON.parse(res.body) as SparqlResponse;
    } catch {
      return { companies: [], employees: [] };
    }
    const bindings = parsed?.results?.bindings ?? [];
    const companies: CompanyDraft[] = [];
    for (const b of bindings) {
      const name = b.companyLabel?.value?.trim() ?? "";
      if (!name) continue;
      const domain = decodeWikidataDomain(b.websiteRaw?.value);
      const city = b.cityLabel?.value?.trim() ?? null;
      const code = (b.countryCode?.value ?? countryCode ?? "").toUpperCase().slice(0, 2);
      const industryHint = b.industryLabel?.value?.trim() ?? null;
      const linkedinSlug = b.linkedinUserName?.value?.trim() ?? null;
      const linkedinUrl = linkedinSlug
        ? `https://www.linkedin.com/company/${linkedinSlug.replace(/^https?:\/\/.+\/company\//i, "").replace(/\/$/, "")}`
        : null;
      const industryClassification = classifyIndustry({
        name,
        websiteMeta: industryHint,
      });
      companies.push({
        name,
        domain,
        hqCountry: code || null,
        hqAdmin1: admin1,
        hqCity: city,
        industryCode: industryClassification.code ?? findIndustryByCode("it_software")?.code ?? null,
        subIndustryCode: industryClassification.subCode ?? null,
        linkedinUrl,
        source: "wikidata",
        sourceEvidenceUrl: `https://www.wikidata.org/wiki/${(b.company?.value ?? "")
          .replace(/^https?:\/\/www\.wikidata\.org\/entity\//, "")}`,
      });
    }
    return { companies, employees: [] };
  },
};
