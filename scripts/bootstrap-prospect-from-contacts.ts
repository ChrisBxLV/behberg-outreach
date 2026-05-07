import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { upsertCompany, normalizeDomain } from "../server/services/prospect/repository";

type RawRow = {
  name: string;
  keyName: string;
  domain: string | null;
  countRows: number;
};

function csvEscape(v: string | null | undefined): string {
  const s = (v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

async function main() {
  const limit = Number(process.argv[2] ?? 1000);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("Pass a positive limit, e.g. `tsx scripts/bootstrap-prospect-from-contacts.ts 1000`");
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT
      TRIM(company) AS name,
      LOWER(TRIM(company)) AS keyName,
      normalizedDomain AS domain,
      COUNT(*) AS countRows
    FROM contacts
    WHERE company IS NOT NULL
      AND TRIM(company) <> ''
    GROUP BY LOWER(TRIM(company)), normalizedDomain
    ORDER BY countRows DESC
    LIMIT ${Math.max(limit * 4, 4000)}
  `);

  const rows = (result as any[]).map((r: any) => ({
    name: String(r.name ?? "").trim(),
    keyName: String(r.keyName ?? "").trim(),
    domain: r.domain == null ? null : String(r.domain).trim().toLowerCase(),
    countRows: Number(r.countRows ?? 0),
  })) as RawRow[];

  const chosen = new Map<string, RawRow>();
  for (const row of rows) {
    if (!row.name || !row.keyName) continue;
    const current = chosen.get(row.keyName);
    if (!current) {
      chosen.set(row.keyName, row);
      continue;
    }
    // Prefer the variant that has a domain, then the one with higher frequency.
    const currentScore = (current.domain ? 2 : 0) + (current.countRows > row.countRows ? 1 : 0);
    const nextScore = (row.domain ? 2 : 0) + (row.countRows > current.countRows ? 1 : 0);
    if (nextScore > currentScore) chosen.set(row.keyName, row);
  }

  const shortlist = Array.from(chosen.values()).slice(0, limit);
  let insertedOrMerged = 0;
  let skipped = 0;
  for (const c of shortlist) {
    const domain = normalizeDomain(c.domain);
    const upserted = await upsertCompany({
      name: c.name,
      domain,
      hqCountry: null,
      source: "user_import",
      sourceEvidenceUrl: "contacts_bootstrap",
    });
    if (upserted) insertedOrMerged++;
    else skipped++;
  }

  const csvPath = resolve(process.cwd(), "scripts", `bootstrap_companies_${limit}.csv`);
  const lines = [
    "name,domain,source,sourceEvidenceUrl,rowCountHint",
    ...shortlist.map(r =>
      [
        csvEscape(r.name),
        csvEscape(r.domain),
        csvEscape("user_import"),
        csvEscape("contacts_bootstrap"),
        csvEscape(String(r.countRows)),
      ].join(","),
    ),
  ];
  writeFileSync(csvPath, `${lines.join("\n")}\n`, "utf8");

  console.log(
    `[bootstrap-prospect-from-contacts] shortlist=${shortlist.length} upserted=${insertedOrMerged} skipped=${skipped} csv=${csvPath}`,
  );
}

main().catch(err => {
  console.error("[bootstrap-prospect-from-contacts] failed:", err);
  process.exitCode = 1;
});

