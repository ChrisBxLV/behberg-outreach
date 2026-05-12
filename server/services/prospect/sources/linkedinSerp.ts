// LinkedIn discovery is not implemented via HTML search engines.
//
// `safeFetch` blocks linkedin.com. Google / DuckDuckGo / Bing search HTML is not
// fetched here. When `PROSPECT_ENABLE_SERP_SOURCES` is true, adapters stay
// registered for a future official search API; they currently no-op.
//
// Employee promotion (`linkedin_employee_serp_promote`) does not enqueue
// `harvest_employee` jobs until a vetted discovery backend exists.

import type { EmployeeDraft, SeedAdapter, SeedRunInput, SeedRunResult } from "../types";
import type { ProspectCompany } from "../../../../drizzle/schema";

export const linkedinSerpSeedAdapter: SeedAdapter = {
  kind: "linkedin_company_serp",
  async run(_input: SeedRunInput): Promise<SeedRunResult> {
    void _input;
    return { companies: [], employees: [] };
  },
};

export const linkedinEmployeePromoteAdapter: SeedAdapter = {
  kind: "linkedin_employee_serp_promote",
  async run(_input: SeedRunInput): Promise<SeedRunResult> {
    void _input;
    return { companies: [], employees: [], followupJobs: [] };
  },
};

export async function harvestEmployeesForCompany(_company: ProspectCompany): Promise<EmployeeDraft[]> {
  void _company;
  return [];
}
