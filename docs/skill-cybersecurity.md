# Skill: Cybersecurity Triage and Response

Use this when work involves suspected abuse, hardening priorities, incident-like symptoms, or broader security posture checks in this app.

## Mission

1. Confirm what is happening with concrete evidence.
2. Contain risk in code/config with minimal blast radius.
3. Add or update tests/runbooks so the same class of issue is easier to catch next time.

## 1) Rapid triage checklist

1. Reproduce with local runtime:
   - `pnpm dev`
2. Confirm if issue is:
   - auth/session bypass,
   - tenant isolation leak,
   - privilege escalation,
   - secret/config exposure,
   - unsafe external callback/webhook behavior.
3. Capture evidence in terminal output and focused test runs before code changes.

## 2) High-value areas in this repo

- Session + cookie behavior:
  - `server/_core/cookies.ts`
  - `server/_core/sdk.ts`
- AuthN/AuthZ entry points:
  - `server/_core/trpc.ts`
  - `server/_core/authz/permissions.ts`
  - `server/_core/authz/tenantScope.ts`
  - `server/routers.ts`
- Superadmin and platform controls:
  - `server/routers/platform.ts`
- Callback/webhook paths:
  - `server/expressRoutes.ts`
  - `server/services/mailboxOAuth.ts`
- Secret handling and env wiring:
  - `.env.example`
  - `server/_core/env.ts`

## 3) Practical security validation workflows

### Workflow A: Authorization boundaries

Goal: protected and privileged endpoints reject wrong users.

1. Run focused tests:
   - `pnpm vitest run server/_core/authz/tenantScope.test.ts server/orgScope.test.ts server/platform.test.ts`
2. Manual check:
   - sign in as non-superadmin,
   - open `/app/superadmin`,
   - verify access denied behavior.

Expected signals:

- tests pass;
- no cross-tenant data appears to ordinary users.

### Workflow B: Session behavior and cookie safety

Goal: session cookie is issued and enforced with expected security properties.

1. Run auth tests:
   - `pnpm vitest run server/auth.logout.test.ts server/verifyLoginCode.allowsOrgMembers.test.ts`
2. Manual:
   - login at `/login`,
   - refresh `/app`,
   - logout,
   - verify protected routes redirect back to login.

Expected signals:

- active session survives refresh;
- logout clears access.

### Workflow C: Runtime hardening toggles

Goal: runtime config behaves as expected under secure defaults.

1. Set in `.env`:
   - `AUTH_REQUIRE_EMAIL_OTP=true`
   - `DISABLE_SCHEDULER=true`
2. Restart app: `pnpm dev`
3. Verify runtime flags in `/app/superadmin`.

Expected signals:

- OTP flow requires verification;
- scheduler-related side effects stay off.

## 4) Containment and remediation pattern

When issue is confirmed:

1. Add minimal fix in the narrowest layer (middleware/router guard first).
2. Add focused regression tests in `server/*.test.ts`.
3. Re-run only impacted tests + `pnpm run check`.
4. Update this skill or `docs/cloud-agent-starter-skill.md` with the new detection/remediation trick.

## 5) Never-do list

- Do not commit real credentials, tokens, or mailbox secrets.
- Do not weaken auth checks to make tests pass.
- Do not bypass tenant scoping in shared query paths.
- Do not add broad logging of secrets/PII.
