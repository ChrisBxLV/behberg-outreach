/**
 * Prints SQL to baseline __drizzle_migrations when the DB already has all tables
 * but Drizzle tries to re-run CREATE TABLE (errno 1050).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const entries = journal.entries ?? [];
if (!entries.length) {
  console.error("No entries in drizzle/meta/_journal.json");
  process.exit(1);
}
const last = entries[entries.length - 1];

console.log(`Latest migration in this repo: ${last.tag}`);
console.log(`Use this created_at for baselining: ${last.when}\n`);
console.log("-- Run against your app database (adjust name if needed):");
console.log("USE behberg_outreach;\n");
console.log(`CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`hash\` text NOT NULL,
  \`created_at\` bigint DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n`);
console.log("DELETE FROM __drizzle_migrations;");
console.log(
  `INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES ('baseline', ${last.when});\n`,
);
console.log("-- Then: pnpm run db:migrate (only newer migrations will run)\n");
