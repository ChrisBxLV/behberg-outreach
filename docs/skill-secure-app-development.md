# Skill: Secure App Development

Use this when changing auth, API handlers, DB writes, cookies, or any user-controlled input path.

## Scope in this repo

- Server auth/session: `server/routers.ts`, `server/_core/sdk.ts`, `server/_core/cookies.ts`
- Authorization and tenant scoping: `server/_core/trpc.ts`, `server/_core/authz/*`
- Data boundaries: `server/db.ts`, `server/routers/*.ts`
- Client auth surfaces: `client/src/pages/Login*.tsx`, `client/src/main.tsx`

## Secure implementation checklist

1. Validate all external input with `zod` at route boundaries.
2. Enforce auth with `protectedProcedure`/`adminProcedure`/`superadminProcedure` instead of inline role checks.
3. Keep tenant boundaries explicit:
   - resolve scope with `resolveTenantQueryScope` / `requireTenantQueryScope`.
   - never run tenant reads/writes without scope.
4. Preserve secure cookie behavior:
   - use `getSessionCookieOptions(req)`, do not hand-roll cookie flags.
5. Keep secrets in env only:
   - no hardcoded credentials, tokens, API keys, or mail secrets.
6. Do not leak sensitive values in logs/errors returned to users.

## Fast security test workflow

Run after security-sensitive changes:

1. Type safety:
   - `pnpm run check`
2. Auth/session tests:
   - `pnpm vitest run server/auth.logout.test.ts server/verifyLoginCode.allowsOrgMembers.test.ts`
3. Authorization/scope tests:
   - `pnpm vitest run server/_core/authz/tenantScope.test.ts server/orgScope.test.ts server/listOrganizationMembers.await.test.ts`
4. Manual negative-path check:
   - open private page without login and verify redirect to `/login`
   - sign in, refresh `/app`, verify session remains valid

## Common mistakes to avoid

- Returning tenant data for users without an organization context.
- Skipping permission middleware because "UI already hides the button".
- Returning raw thrown errors to the client.
- Changing cookie settings in one route only (causes inconsistent auth behavior).

## Done criteria

- Targeted security tests pass.
- At least one manual unauthorized-path check is completed.
- No new hardcoded secrets or sensitive logs introduced.
