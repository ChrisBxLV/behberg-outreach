# Database integrity (MySQL + Drizzle)

This app uses **Drizzle ORM** with **MySQL**. “Integrity” usually means: the database rejects invalid data, related rows stay consistent, and schema changes are applied in a controlled way.

## 1. Schema migrations (source of truth)

- Table definitions live in `drizzle/schema.ts`.
- SQL migrations are generated under `drizzle/` (see project scripts, e.g. `drizzle-kit`).
- **Production rule:** deploy only after running the latest migrations against your database so the live DB matches the code.

## 2. Foreign keys (referential integrity)

Many tables use logical IDs (`campaignId`, `contactId`, …). In MySQL you can enforce relationships with **foreign keys** so you cannot delete a campaign while rows still reference it (or you can choose `ON DELETE CASCADE`).

In Drizzle, you add a reference when you define the column, for example:

```ts
import { foreignKey } from "drizzle-orm/mysql-core";

// Example pattern (not necessarily applied everywhere in this repo yet):
campaignId: int("campaignId")
  .notNull()
  .references(() => campaigns.id, { onDelete: "restrict" }),
```

Then generate a **new migration** and apply it. Existing data must already satisfy the constraint before the FK is added (no orphan IDs).

## 3. Transactions (logical integrity)

When one user action updates several tables (e.g. enroll contact + bump counts), wrap the work in a **transaction** so either everything commits or nothing does. In Drizzle with `mysql2`, use the driver’s transaction API and run related `insert`/`update`/`delete` inside it.

## 4. Uniqueness and required fields

You already have examples in `schema.ts`:

- `unique()` on `openId`, `batchId`, `trackingId`, etc.
- `.notNull()` on critical columns

These are enforced by the database once migrated.

## 5. Development without MySQL (`.data/local-auth.json`)

When `DATABASE_URL` is unset in development, auth uses a **JSON file**, not MySQL. File storage does **not** give you SQL foreign keys or transactions across “tables”—it’s for local convenience only. Use a real MySQL database when you care about full DB integrity.

## 6. Practical checklist

1. Set `DATABASE_URL` for staging/production.
2. Run migrations before starting the app on a new environment.
3. Prefer **transactions** for multi-step writes.
4. Add **foreign keys** where relationships must never point at missing rows (plan migrations carefully if data already exists).

For questions specific to your host (PlanetScale, RDS, etc.), check their notes on foreign keys and migrations—they sometimes differ slightly from plain MySQL.

## 7. Linux server: `Access denied for user 'root'@'localhost'` (errno 1698)

On Ubuntu/Debian (and similar), MySQL often configures **`root@localhost` to use `auth_socket`**: the OS user `root` can run `sudo mysql` with no password, but **TCP clients** (Drizzle, `mysql2`, any `DATABASE_URL` connection to `127.0.0.1`/`localhost:3306`) cannot log in as MySQL `root` with a password. You may see **errno 1698** or messages about password/auth when running `pnpm run db:push`.

**Recommended fix:** create a dedicated database user with a password and put that user in `DATABASE_URL` (do not rely on MySQL `root` for the app).

As the system superuser, open a local MySQL admin session (no password needed when using socket auth):

```bash
sudo mysql
```

Then run (replace the password and database name to match your `.env`):

```sql
CREATE DATABASE IF NOT EXISTS behberg_outreach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'behberg_app'@'localhost' IDENTIFIED BY 'your_strong_password_here';
GRANT ALL PRIVILEGES ON behberg_outreach.* TO 'behberg_app'@'localhost';
FLUSH PRIVILEGES;
```

Set:

```env
DATABASE_URL=mysql://behberg_app:your_strong_password_here@127.0.0.1:3306/behberg_outreach
```

Use **`127.0.0.1`** if your client library treats `localhost` differently from TCP (either usually works once the user is allowed to authenticate by password).

**Alternative (less ideal):** force MySQL `root` to accept password auth over TCP (MySQL 8+):

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'your_password';
FLUSH PRIVILEGES;
```

Prefer a dedicated app user so the application does not use the superuser account.

## 8. `Table '…' already exists` (errno 1050) when running migrations

Drizzle records applied SQL files in **`__drizzle_migrations`**. If your database **already has the tables** (from an earlier run, manual SQL, or a restore) but that table is **empty or behind**, `drizzle-kit migrate` starts over from the first migration and MySQL errors on `CREATE TABLE`.

### What to do next

**A. Empty / throwaway database (simplest)**  
If you do not need the data: drop the app schema and re-run migrations.

```sql
-- In MySQL, for your database (e.g. behberg_outreach):
SET FOREIGN_KEY_CHECKS = 0;
-- Drop application tables (or drop database and recreate empty DB).
SET FOREIGN_KEY_CHECKS = 1;
DROP TABLE IF EXISTS __drizzle_migrations;
```

Then from the app directory:

```bash
pnpm run db:migrate
```

**B. Keep existing data (baseline migration history)**  
If the live schema already matches **all committed migrations** in `drizzle/meta/_journal.json` through the latest tag (e.g. `0006_organization_signal_foreign_keys`), tell Drizzle the chain is applied by inserting **one row** whose `created_at` is the `when` value of that last journal entry (Drizzle skips any migration whose `folderMillis` is not greater than the latest stored `created_at`).

Example for this repo when the DB is fully up to date through `0006` (`when` is `1774292400000` in `_journal.json`—confirm on your branch):

```sql
INSERT INTO __drizzle_migrations (`hash`, `created_at`)
VALUES ('baseline', 1774292400000);
```

Use any non-empty `hash`; only `created_at` drives the skip logic. If you add a **new** migration later (`0007`, …), Drizzle will still apply only migrations newer than that timestamp.

**C. Production deploy workflow**  
Run **`pnpm run db:migrate`** on the server after pulling code. **Do not** run `drizzle-kit generate` on the server: new migrations should be generated in development, committed under `drizzle/*.sql`, then applied with `db:migrate`. The `db:push` script runs generate and migrate together and is mainly for local iteration.

If you previously generated an extra migration on the server (e.g. `0007_*.sql`) that duplicates older steps, remove that file and fix `drizzle/meta/_journal.json` to match the repo, or reset the database per (A).
