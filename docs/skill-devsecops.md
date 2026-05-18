# Skill: DevSecOps

Use this skill when adding security checks to CI/CD, release gates, or operational hardening workflows.

## Scope in this repo

- Node/TypeScript app with `pnpm`.
- Core quality gates already available:
  - `pnpm run check`
  - `pnpm vitest run ...`
- Runtime toggles and auth behavior are env-driven (`.env`, `.env.example`).

## 1) Baseline DevSecOps gate for Cloud agents

Run in this order for non-trivial changes:

1. Type safety:
   - `pnpm run check`
2. Impacted security-sensitive tests:
   - `pnpm vitest run server/auth.logout.test.ts server/agentDebugLog.production-gating.test.ts server/_core/authz/tenantScope.test.ts`
3. Manual security smoke:
   - verify protected routes require auth,
   - verify forbidden operations return `FORBIDDEN`,
   - verify runtime flags in `/app/superadmin` match intended environment.

Expected signal:

- all commands pass,
- no auth/authorization regressions in manual checks.

## 2) Secret and config hygiene checks

Before commit:

1. Ensure no real credentials were added to tracked files:
   - `rg "AIza|-----BEGIN PRIVATE KEY-----|FIREBASE_SERVICE_ACCOUNT_JSON=\\{|JWT_SECRET=|SMTP_PASS=|BUILT_IN_FORGE_API_KEY=" .env.example docs server client`
2. Ensure `.env` remains local-only and untracked:
   - `git status --short`

Expected signal:

- no real key material in tracked files,
- `.env` not staged.

## 3) Hardening checks for deploy changes

If you touch deploy/runtime scripts, validate:

1. Production startup still builds and runs:
   - `pnpm run build`
   - `pnpm run start` (or service-specific equivalent in deploy notes)
2. Cookie/session behavior remains safe:
   - verify `secure` cookie behavior still depends on HTTPS/proxy headers,
   - verify `sameSite` is not forced to insecure production values.

Expected signal:

- build succeeds,
- no session regressions.

## 4) Security regression checklist for PRs

Use this mini checklist in every security-relevant PR:

- [ ] Auth: unauthenticated calls are denied.
- [ ] AuthZ: role/tenant boundaries still enforced.
- [ ] Session: cookie flags remain safe.
- [ ] Secrets: no plaintext secrets committed.
- [ ] Observability: no debug-only sensitive logs leaked to production paths.

## 5) How to update this skill

When a new DevSecOps guard proves useful:

1. Add it under the closest section above.
2. Include exact command(s) and expected pass/fail signal.
3. If it replaces an older guard, delete the older one in the same PR.
