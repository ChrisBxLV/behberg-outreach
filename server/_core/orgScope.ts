import type { User } from "../../drizzle/schema";
import { ENV } from "./env";

/**
 * Workspace organization id on the user row (single-tenant attachment).
 * Does **not** imply cross-tenant access — use `resolveTenantQueryScope` from `authz` for query filtering.
 */
export function dataScopeOrganizationId(user: User | null | undefined): number | null {
  const id = user?.organizationId;
  if (id == null || id <= 0) return null;
  return id;
}

export function isOrganizationOwner(user: User | null | undefined): boolean {
  return Boolean(user?.organizationId && user.orgMemberRole === "owner");
}

/** After password / OTP sign-in, keep platform superadmin; otherwise default elevated session role to admin. */
export function resolvedPasswordSessionRole(
  currentRole: User["role"] | null | undefined,
): Extract<User["role"], "admin" | "superadmin"> {
  if (currentRole === "superadmin") return "superadmin";
  return "admin";
}

/**
 * Same username as `DEFAULT_ADMIN_LOGIN` with the seeded row shape (`login:<login>` or email exactly `<login>`).
 * Used on password / OTP upsert so the platform operator is not overwritten with `admin`.
 */
export function isStrictDefaultOperatorPasswordIdentity(
  user: User | null | undefined,
  loginId: string,
): boolean {
  const lid = loginId.trim().toLowerCase();
  const expected = ENV.defaultAdminLogin.trim().toLowerCase();
  if (!lid || !expected || lid !== expected) return false;
  if (!user) return false;
  const oid = (user.openId ?? "").trim().toLowerCase();
  if (oid === `login:${lid}`) return true;
  const em = (user.email ?? "").trim().toLowerCase();
  return em === lid;
}

/** Persisted role after successful password or email-OTP completion for this login id. */
export function resolvedElevatedRoleAfterPasswordLogin(
  user: User | null | undefined,
  loginId: string,
): Extract<User["role"], "admin" | "superadmin"> {
  if (isStrictDefaultOperatorPasswordIdentity(user, loginId)) return "superadmin";
  return resolvedPasswordSessionRole(user?.role);
}

/**
 * Matches `DEFAULT_ADMIN_LOGIN` against `openId` / `email` / (Firebase only) display `name`.
 * Apple and some IdPs omit email in tokens; matching `name` avoids hiding the Superadmin console.
 */
export function matchesConfiguredDefaultOperatorLogin(
  openId: string | null | undefined,
  email: string | null | undefined,
  name?: string | null,
): boolean {
  const login = ENV.defaultAdminLogin.trim().toLowerCase();
  if (!login) return false;
  const oid = (openId ?? "").trim().toLowerCase();
  if (oid === `login:${login}`) return true;
  const em = (email ?? "").trim().toLowerCase();
  if (em === login) return true;
  const at = em.indexOf("@");
  if (at > 0 && em.slice(0, at) === login) return true;
  const nm = (name ?? "").trim().toLowerCase();
  if (nm === login && oid.startsWith("firebase:")) return true;
  return false;
}

/** Row is the seeded operator identity from `DEFAULT_ADMIN_LOGIN` (used to gate “disable default” in console). */
export function isDefaultEnvOperatorAccount(user: User | null | undefined): boolean {
  if (!user) return false;
  return matchesConfiguredDefaultOperatorLogin(user.openId, user.email, user.name);
}

/**
 * Platform console (cross-tenant): `superadmin` role, or the configured default operator
 * (`DEFAULT_ADMIN_LOGIN` / `login:<login>`) so Behberg access works before/without enum migration.
 */
export function isPlatformOperatorUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.accountDisabled) return false;
  if (user.role === "superadmin") return true;
  return matchesConfiguredDefaultOperatorLogin(user.openId, user.email, user.name);
}
