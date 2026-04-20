# Skill: Penetration Testing (Authorized Internal Testing)

Use this skill for controlled security testing of this app in local/dev environments you are explicitly authorized to test.

## Scope and safety guardrails

- Test only local/dev targets you control (for example `http://localhost:3000`).
- Do not test third-party infrastructure, production systems, or external domains without explicit approval.
- Prefer read/validate style probes first, then limited mutation tests that can be rolled back.

## Test setup

1. Start local app:
   - `cp .env.example .env`
   - set `DISABLE_SCHEDULER=true` in `.env`
   - `pnpm dev`
2. Use default local auth if `DATABASE_URL` is blank:
   - `/login` with `behberg` / `grebheb`
3. Optional clean state:
   - `rm -f .data/local-auth.json`

## Test workflow by attack surface

### 1) Auth/session abuse checks

Objective: verify unauthenticated and cross-role access is blocked.

Steps:

1. Call protected tRPC route without cookie.
2. Call superadmin route as non-superadmin user.
3. Retry with valid superadmin session.

Expected:

- Missing session => `UNAUTHORIZED`.
- Wrong role => `FORBIDDEN`.
- Valid superadmin => success for platform routes only.

Relevant controls:

- `server/_core/trpc.ts`
- `server/_core/authz/permissions.ts`

### 2) Tenant boundary checks (IDOR style)

Objective: ensure users cannot access another org's data by changing IDs in requests.

Steps:

1. Create or use two org-scoped users.
2. For org A user, request org B resources by ID through contacts/campaigns/org routes.
3. Inspect response and server behavior.

Expected:

- Access denied or empty scoped dataset.
- No cross-tenant records returned.

Relevant controls:

- `server/_core/authz/tenantScope.ts`
- `server/routers/contacts.ts`
- `server/routers/campaigns.ts`
- `server/routers/organization.ts`

### 3) Input abuse checks (validation bypass probes)

Objective: ensure malformed input is rejected before dangerous operations.

Steps:

1. Send malformed payloads to tRPC endpoints (missing required fields, bad enum values, oversized strings).
2. Test CSV upload endpoint with wrong MIME and oversized files.

Expected:

- Schema validation errors from zod/tRPC.
- CSV endpoint rejects non-CSV and too-large payloads.

Relevant controls:

- `server/routers.ts` (zod input schemas)
- `server/expressRoutes.ts` (`multer` limits + filter)

### 4) Sensitive endpoint behavior checks

Objective: verify tracking/unsubscribe/mailbox endpoints behave safely under abuse.

Steps:

1. Probe `/api/track/:trackingId.gif` and `/api/unsubscribe/:trackingId` with random IDs.
2. Probe mailbox webhook route with random payloads.

Expected:

- No stack traces or secret leakage.
- Predictable error behavior and bounded responses.

Relevant controls:

- `server/expressRoutes.ts`

## Minimal reproducible command set

Use these as a baseline evidence bundle in PRs:

1. `pnpm run check`
2. `pnpm vitest run server/auth.logout.test.ts server/_core/authz/tenantScope.test.ts server/platform.test.ts`
3. Optional targeted route probing with `curl` against local server endpoints under test.

## Reporting format for findings

For each issue found, include:

1. Severity (high/medium/low)
2. Endpoint or code path
3. Reproduction steps (copy-paste)
4. Expected vs actual behavior
5. Proposed fix and regression test

## Updating this skill

When a new exploit pattern or hardening check is discovered:

1. Add it under the closest attack surface section above.
2. Include exact request shape/command and expected secure result.
3. Link the owning code file so future agents can patch quickly.
