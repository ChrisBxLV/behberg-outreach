// Promotes the next batch of companies into the employee discovery queue.
//
// The seed-tick schedules this adapter every 6h. It looks for active
// companies that we have a domain for and that don't yet have any employees,
// then surfaces them so `linkedinSerp.harvestEmployeesForCompany` can pick
// them up.

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { prospectCompanies, prospectEmployees } from "../../../../drizzle/schema";

export async function promoteCompaniesIntoEmployeeQueue(limit: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: prospectCompanies.id })
    .from(prospectCompanies)
    .leftJoin(prospectEmployees, eq(prospectEmployees.companyId, prospectCompanies.id))
    .where(
      and(
        eq(prospectCompanies.status, "active"),
        isNotNull(prospectCompanies.domain),
      ),
    )
    .groupBy(prospectCompanies.id)
    .having(sql`COUNT(${prospectEmployees.id}) = 0`)
    .limit(limit);
  return rows.map(r => r.id);
}
