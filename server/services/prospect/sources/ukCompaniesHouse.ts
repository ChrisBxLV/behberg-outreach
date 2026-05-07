// UK Companies House seed adapter.
//
// Uses the public REST API (https://api.company-information.service.gov.uk).
// Requires a free API key in `COMPANIES_HOUSE_API_KEY`; if missing, this
// adapter returns an empty result rather than failing the run, so the rest of
// the crawler stays operational.

import { classifyIndustry } from "../industryClassifier";
import type { CompanyDraft, SeedAdapter, SeedRunInput, SeedRunResult } from "../types";

const ROOT = "https://api.company-information.service.gov.uk";

type CompaniesHouseSearchResult = {
  items?: Array<{
    company_name?: string;
    company_number?: string;
    company_status?: string;
    address?: { locality?: string; postal_code?: string; country?: string };
    sic_codes?: string[];
  }>;
};

const SEARCH_TERMS = [
  "limited",
  "consulting",
  "technology",
  "engineering",
  "capital",
  "advisory",
  "holdings",
  "services",
];

export const ukCompaniesHouseSeedAdapter: SeedAdapter = {
  kind: "uk_ch",
  async run(_input: SeedRunInput): Promise<SeedRunResult> {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY?.trim();
    if (!apiKey) return { companies: [], employees: [] };

    const term = pickSearchTerm();
    const url = `${ROOT}/search/companies?q=${encodeURIComponent(term)}&items_per_page=50`;

    const auth = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: ac.signal,
        headers: {
          Authorization: auth,
          Accept: "application/json",
          "User-Agent": "krot.io-prospect-crawler/1.0 (+https://krot.io)",
        },
      });
      if (!res.ok) return { companies: [], employees: [] };
      const data = (await res.json()) as CompaniesHouseSearchResult;
      const items = data.items ?? [];
      const companies: CompanyDraft[] = [];
      for (const it of items) {
        const name = it.company_name?.trim();
        if (!name) continue;
        if ((it.company_status ?? "").toLowerCase() !== "active") continue;
        const classification = classifyIndustry({
          name,
          websiteMeta: it.sic_codes?.join(" ") ?? null,
        });
        companies.push({
          name,
          hqCountry: "GB",
          hqCity: it.address?.locality ?? null,
          industryCode: classification.code ?? null,
          subIndustryCode: classification.subCode ?? null,
          source: "uk_ch",
          sourceEvidenceUrl: it.company_number
            ? `https://find-and-update.company-information.service.gov.uk/company/${it.company_number}`
            : null,
        });
      }
      return { companies, employees: [] };
    } catch {
      return { companies: [], employees: [] };
    } finally {
      clearTimeout(t);
    }
  },
};

function pickSearchTerm(): string {
  const idx = Math.floor(Date.now() / 86_400_000) % SEARCH_TERMS.length;
  return SEARCH_TERMS[idx] ?? SEARCH_TERMS[0]!;
}
