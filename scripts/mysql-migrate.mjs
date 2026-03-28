/**
 * MySQL migrations without one big transaction.
 *
 * Drizzle's default migrator runs all statements inside a single transaction. In MySQL,
 * CREATE TABLE (and other DDL) causes an implicit commit, so journal inserts can roll back
 * while tables stay — next run skips 0000/0001 in spirit but __drizzle_migrations is wrong
 * and you get "table already exists" on 0002.
 *
 * This script applies each migration file in order, commits normally, and records each one.
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { readMigrationFiles } from "drizzle-orm/migrator.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(root, "drizzle");
const url = process.env.DATABASE_URL;

if (!url?.trim()) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const MIGRATIONS_TABLE = "__drizzle_migrations";

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    const [[dbRow]] = await conn.query("SELECT DATABASE() AS db");
    const dbName = dbRow?.db;
    console.log(`[db:migrate] Connected. Database: ${dbName ?? "(none)"}`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`hash\` text NOT NULL,
        \`created_at\` bigint DEFAULT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await conn.query(
      `SELECT \`created_at\` FROM \`${MIGRATIONS_TABLE}\` ORDER BY \`created_at\` DESC LIMIT 1`,
    );
    let lastCreatedAt =
      rows.length === 0 || rows[0].created_at == null
        ? null
        : Number(rows[0].created_at);

    const migrations = readMigrationFiles({ migrationsFolder });
    let applied = 0;

    for (const migration of migrations) {
      const shouldRun =
        lastCreatedAt == null || lastCreatedAt < migration.folderMillis;
      if (!shouldRun) continue;

      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        await conn.query(trimmed);
      }

      await conn.query(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (\`hash\`, \`created_at\`) VALUES (?, ?)`,
        [migration.hash, migration.folderMillis],
      );
      lastCreatedAt = migration.folderMillis;
      applied += 1;
      console.log(`[db:migrate] Applied migration (created_at=${migration.folderMillis})`);
    }

    if (applied === 0) {
      console.log("[db:migrate] Already up to date.");
    } else {
      console.log(`[db:migrate] Done. Applied ${applied} migration(s).`);
    }
  } finally {
    await conn.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
