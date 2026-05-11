// SEC EDGAR seed adapter.
//
// Walks the company tickers JSON feed (https://www.sec.gov/files/company_tickers.json)
// to enumerate publicly listed US companies. Each entry contains CIK, ticker,
// and name. SIC codes are not part of this feed but the name + ticker is enough
// for the deterministic industry classifier to slot most of them.

import { safeFetch } from "../safeFetch";
import { classifyIndustry } from "../industryClassifier";
import type { CompanyDraft, SeedAdapter, SeedRunInput, SeedRunResult } from "../types";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

type Ticker = {
  cik_str: number;
  ticker: string;
  title: string;
};

export const secEdgarSeedAdapter: SeedAdapter = {
  kind: "sec_edgar",
  async run(_input: SeedRunInput): Promise<SeedRunResult> {
    const res = await safeFetch(TICKERS_URL, {
      accept: "application/json",
      timeoutMs: 20_000,
      maxBytes: 6_000_000,
      skipRobotsTxt: true,
    });
    if (!res) return { companies: [], employees: [] };

    let parsed: Record<string, Ticker> | null = null;
    try {
      parsed = JSON.parse(res.body) as Record<string, Ticker>;
    } catch {
      return { companies: [], employees: [] };
    }
    if (!parsed || typeof parsed !== "object") return { companies: [], employees: [] };

    // Take a stable, paginated slice each run so we cycle through the entire
    // list over weeks instead of all at once.
    const entries = Object.values(parsed);
    const cursor = pickCursor(entries.length);
    const slice = entries.slice(cursor, cursor + 80);
    const companies: CompanyDraft[] = slice
      .map(t => buildDraft(t))
      .filter((d): d is CompanyDraft => d !== null);

    return { companies, employees: [] };
  },
};

function buildDraft(t: Ticker): CompanyDraft | null {
  const name = (t.title ?? "").trim();
  if (!name) return null;
  const classification = classifyIndustry({ name, websiteMeta: null });
  return {
    name,
    domain: null,
    hqCountry: "US",
    industryCode: classification.code ?? null,
    subIndustryCode: classification.subCode ?? null,
    source: "sec_edgar",
    sourceEvidenceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(t.cik_str ?? "")
      .padStart(10, "0")}`,
  };
}

function pickCursor(total: number): number {
  if (total <= 80) return 0;
  // Day-of-year windowing keeps us cycling through the universe.
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start) / 86_400_000);
  return (day * 80) % total;
}
