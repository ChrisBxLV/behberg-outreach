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

## 8. Database stuck or “table already exists”

**Easiest fix (OK if you do not need the data in that database):**

1. In MySQL, reset the app database (change the name if yours is different):

```sql
DROP DATABASE IF EXISTS behberg_outreach;
CREATE DATABASE behberg_outreach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. On the server: `git pull`, then `pnpm run db:migrate`.

3. Keep `DATABASE_URL` in `.env` pointed at that database.

**After that, day to day:** pull code, then `pnpm run db:migrate`. Do not run `drizzle-kit generate` on the server.

**Rare case — you must keep existing data** and still see the error: run `pnpm run db:baseline-hint`, paste the SQL it prints into MySQL, then `pnpm run db:migrate` again.
