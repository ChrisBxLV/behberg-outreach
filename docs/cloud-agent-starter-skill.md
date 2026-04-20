# Cloud Agent Starter Skill: Run + Test

Use this as the default runbook when a Cloud agent starts work in this repo.

## Companion security skills

Use these alongside this starter skill when the task is security-heavy:

- `docs/skill-secure-app-development.md`
- `docs/skill-devsecops.md`
- `docs/skill-cybersecurity.md`
- `docs/skill-penetration-testing.md`

## 1) Fast bootstrap (first 3-5 minutes)

1. Install deps (repo uses `pnpm`):
   - `pnpm install`
2. Create env file:
   - `cp .env.example .env`
3. Start in dev mode:
   - `pnpm dev`
4. Open app:
   - `http://localhost:3000`

### Minimal local auth setup (no MySQL required)

For quickest bring-up, keep these defaults:

- Leave `DATABASE_URL` unset (or blank) in `.env` to use `.data/local-auth.json`.
- Keep `AUTH_REQUIRE_EMAIL_OTP=false` for password-only sign-in.
- Keep `DISABLE_SCHEDULER=true` unless your task needs background jobs.

Then log in at `/login` with:

- Username: `behberg`
- Password: `grebheb`

Notes:

- The default operator account is seeded from `DEFAULT_ADMIN_LOGIN` and `DEFAULT_ADMIN_PASSWORD`.
- If you need a clean local auth state: `rm -f .data/local-auth.json` and restart `pnpm dev`.

## 2) Common runtime flags to set/mock

Update `.env`, then restart `pnpm dev`.

- `AUTH_REQUIRE_EMAIL_OTP=true|false`
  - Turns email OTP after password on/off.
  - If `true`, configure `OTP_DELIVERY_EMAIL` (or `SMTP_USER`) for non-email login IDs.
- `DISABLE_SCHEDULER=true|false`
  - Disables all background schedulers when true.
- `DISABLE_SIGNALS_SCHEDULER=true|false`
  - Disables only the signals scheduler.
- `DATABASE_URL=mysql://...`
  - When set, app uses MySQL instead of local file auth.
- Firebase login visibility:
  - Social sign-in only appears when Firebase is configured on both server and client env vars.

Quick verification:

- Sign in as superadmin and open `/app/superadmin`.
- Check Runtime flags panel to confirm effective server state.

## 3) Codebase areas and practical test workflows

### Area A: Auth and login (`/login`, `/login/verify`, session auth)

Use when changing sign-in, password reset, OTP, or session behavior.

Workflow:

1. Use local auth mode (no `DATABASE_URL`) unless the task is DB-specific.
2. Start app: `pnpm dev`.
3. Manual checks:
   - `/login` accepts default credentials and lands on `/app`.
   - `/app` refresh keeps user signed in.
   - `/api/trpc/auth.me` succeeds after login (via app behavior or network check).
4. Targeted automated checks:
   - `pnpm vitest run server/auth.logout.test.ts server/auth/passwordResetChallenge.test.ts server/verifyLoginCode.allowsOrgMembers.test.ts`

If testing OTP flow:

1. Set `AUTH_REQUIRE_EMAIL_OTP=true`.
2. Set `OTP_DELIVERY_EMAIL` (or configure SMTP for real delivery).
3. Confirm login routes to `/login/verify` and accepts 6-digit code.

### Area B: Superadmin and platform controls (`/app/superadmin`)

Use when changing platform user/org management or runtime info UI.

Workflow:

1. Log in as default operator (`behberg` / `grebheb` by default).
2. Open `/app/superadmin`.
3. Manual checks:
   - Runtime flags render expected values from `.env`.
   - Can view users and organizations.
   - Guardrails hold (for example, default operator disable flow requires another active superadmin).
4. Targeted automated checks:
   - `pnpm vitest run server/orgScope.test.ts server/_core/authz/tenantScope.test.ts server/listOrganizationMembers.await.test.ts server/orgUpsertPreserve.test.ts`

### Area C: Organization settings, mailbox auth, SMTP

Use when changing settings pages, mailbox provider config, or SMTP handling.

Workflow:

1. Start with `DISABLE_SCHEDULER=true` to reduce background noise.
2. Log in and open `/app/settings`.
3. Manual checks:
   - SMTP config reads expected values.
   - Mailbox OAuth callback URLs match `APP_BASE_URL`.
   - Provider "configured" states reflect env values.
4. Suggested automated checks:
   - `pnpm vitest run server/platform.test.ts`

### Area D: Campaigns, signals, prospecting

Use when changing campaign sequencing, filters, or prospecting v1 behavior.

Workflow:

1. Prefer MySQL mode for data-heavy behavior:
   - Set `DATABASE_URL`.
   - Run `pnpm run db:migrate`.
2. Start app: `pnpm dev`.
3. Manual checks:
   - Create/edit campaign entities through UI pages under `/app`.
   - Verify no scheduler side effects when toggles are disabled.
4. Targeted automated checks:
   - `pnpm vitest run server/prospectingV1.filters.test.ts server/prospectingV1.patterns.test.ts server/prospectingV1.domainCandidates.test.ts server/tenantMarkReplied.test.ts`

### Area E: DB and migrations (`drizzle/`, `scripts/mysql-migrate.mjs`)

Use when changing schema, migration flow, or DB-specific integrity behavior.

Workflow:

1. Ensure `DATABASE_URL` targets the intended DB.
2. Apply migrations:
   - `pnpm run db:migrate`
3. If schema changed, generate migration locally:
   - `pnpm run db:generate`
4. Validate:
   - Start app and hit critical flows (login, org load, campaign read/write).
   - Run focused tests impacted by the schema change.

## 4) Standard pre-PR verification

Run these before committing unless task scope is docs-only:

1. `pnpm run check`
2. Run at least one focused `pnpm vitest run ...` command for touched area(s).
3. Manual smoke in browser for affected UI/routes.

## 5) How to update this skill

When you discover a new runbook trick, add it immediately in this file.

Update rules:

1. Add only repeatable, copy-pasteable steps.
2. Place the tip under the specific area section above (A-E), not in a random notes block.
3. Include:
   - exact command(s),
   - when to use it,
   - one expected result signal.
4. If it replaces an old step, update the old step in the same PR.
5. Keep this file minimal; remove stale or duplicate advice quickly.
