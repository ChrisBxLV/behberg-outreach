# Live Mailbox OAuth Runbook (krot.io)

This runbook is the operational checklist for restoring and validating Gmail/Microsoft mailbox connect in production.

## 1) Required production environment variables

Set these in the production backend runtime:

- `APP_BASE_URL=https://krot.io`
- `GOOGLE_MAIL_CLIENT_ID=...`
- `GOOGLE_MAIL_CLIENT_SECRET=...`
- `MS_MAIL_CLIENT_ID=...`
- `MS_MAIL_CLIENT_SECRET=...`
- `MAILBOX_TOKEN_ENCRYPTION_KEY=...` (preferred)
  - Fallback is `JWT_SECRET`, but mailbox token encryption should have a dedicated key.

## 2) Provider console callback URLs

Ensure both providers allow the exact callback URLs:

- Google: `https://krot.io/api/mailboxes/oauth/google/callback`
- Microsoft: `https://krot.io/api/mailboxes/oauth/microsoft/callback`

If callback URLs are incorrect, token exchange fails after provider consent.

## 3) Account scope requirement

Mailbox connect requires `organizationId` context. A superadmin account with `organizationId = null` cannot connect mailboxes.

Before testing mailbox connect:

- Sign in with an account that belongs to an organization, or
- Attach the superadmin test account to an organization (`orgMemberRole=owner` recommended).

## 4) One-command live verification

Run the script after deployment:

```bash
LIVE_BASE_URL=https://krot.io \
LIVE_LOGIN_ID=behberg \
LIVE_PASSWORD=your_password_here \
LIVE_EXPECT_APP_BASE_URL=https://krot.io \
npm run verify:live:mailbox-oauth
```

What it verifies:

- Site is reachable
- Login works and session cookie is issued
- `auth.me` is sanitized (no `passwordSalt`/`passwordHash`)
- `settings.getMailboxOAuthConfig` readiness values
- `mailboxes.startConnectOAuth` behavior for Google and Microsoft

Exit code:

- `0` if all required checks pass
- `1` if any required check fails

## 5) Expected healthy output

You should see:

- `PASS` for `APP_BASE_URL readiness`
- `PASS` for `Token encryption readiness`
- `PASS` for provider(s) you configured (`Google OAuth readiness`, `Microsoft OAuth readiness`)
- `PASS` for `<provider> connect start`
- No `FAIL` lines

## 6) Failure mapping

Use this mapping to diagnose quickly:

- `FAIL ... appBaseUrl is empty` -> `APP_BASE_URL` is unset/misconfigured in backend runtime.
- `WARN ... provider credentials are missing` -> corresponding provider client env not set.
- `FAIL ... Organization context required` -> account has no `organizationId`.
- `FAIL ... mailbox OAuth is not configured` -> provider creds and/or encryption secret missing.
- `FAIL auth.me sanitization` -> security regression; do not proceed until fixed.

## 7) Post-fix smoke in UI

After script passes:

1. Sign into `https://krot.io/app`
2. Open `Settings` -> `Mailboxes`
3. Confirm OAuth badge shows ready (for configured providers)
4. Click `Connect Gmail` or `Connect Microsoft`
5. Complete consent and verify inbox appears under connected mailboxes

