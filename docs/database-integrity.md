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
