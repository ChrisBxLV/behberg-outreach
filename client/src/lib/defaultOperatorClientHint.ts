/**
 * Mirrors server `matchesConfiguredDefaultOperatorLogin` so the Superadmin nav appears even if
 * `auth.me.isPlatformOperator` is missing on an older server build.
 *
 * `loginHint` should come from `auth.me.defaultOperatorLogin` or `auth.loginOptions.defaultAdminLogin`.
 * If both are missing (stale bundle), we fall back to `behberg` to match `server/_core/env.ts`.
 */
export function clientMatchesDefaultOperatorLogin(
  user:
    | { openId?: string | null; email?: string | null; name?: string | null; accountDisabled?: boolean }
    | null
    | undefined,
  loginHint: string | null | undefined,
): boolean {
  const login = (loginHint ?? "").trim().toLowerCase() || "behberg";
  if (!user) return false;
  if (user.accountDisabled) return false;
  const oid = (user.openId ?? "").trim().toLowerCase();
  if (oid === `login:${login}`) return true;
  const em = (user.email ?? "").trim().toLowerCase();
  if (em === login) return true;
  const at = em.indexOf("@");
  if (at > 0 && em.slice(0, at) === login) return true;
  const nm = (user.name ?? "").trim().toLowerCase();
  if (nm === login && oid.startsWith("firebase:")) return true;
  return false;
}
