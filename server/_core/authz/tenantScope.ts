import { TRPCError } from "@trpc/server";
import type { User } from "../../../drizzle/schema";
import { isActivePlatformSuperadmin, isPlatformOperatorUser } from "../orgScope";

/**
 * Resolved scope for tenant-scoped database queries.
 * - `tenant`: filter rows to one organization.
 * - `platform`: platform operator without a workspace org — may query across tenants (legacy behavior).
 */
export type TenantQueryScope =
  | { type: "tenant"; organizationId: number }
  | { type: "platform" };

/** User's workspace org id from their profile only (no access-control implication). */
export function workspaceOrganizationId(user: User | null | undefined): number | null {
  const id = user?.organizationId;
  if (id == null || id <= 0) return null;
  return id;
}

/**
 * Resolves how list/get queries should filter by organization.
 * Returns `null` when the user has no tenant context and is not allowed cross-tenant access.
 */
export function resolveTenantQueryScope(user: User | null | undefined): TenantQueryScope | null {
  if (!user) return null;
  if (isPlatformOperatorUser(user)) {
    const wid = workspaceOrganizationId(user);
    if (wid != null) {
      return { type: "tenant", organizationId: wid };
    }
    return { type: "platform" };
  }
  const wid = workspaceOrganizationId(user);
  if (wid != null) {
    return { type: "tenant", organizationId: wid };
  }
  return null;
}

export function requireTenantQueryScope(user: User | null | undefined): TenantQueryScope {
  const scope = resolveTenantQueryScope(user);
  if (scope == null) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization context required.",
    });
  }
  return scope;
}

/**
 * Variant of `requireTenantQueryScope` that grants cross-tenant (`platform`)
 * scope to active platform `superadmin` accounts even when they have a
 * workspace org assigned.
 *
 * Intended for read/write routes that intentionally let strict superadmins
 * see/edit rows across tenants (e.g. contacts list/get used in the platform
 * console). Routes that should always scope superadmins to their own
 * workspace org (e.g. campaigns) should keep using `requireTenantQueryScope`.
 */
export function requireSuperadminOrTenantQueryScope(
  user: User | null | undefined,
): TenantQueryScope {
  if (isActivePlatformSuperadmin(user)) {
    return { type: "platform" };
  }
  return requireTenantQueryScope(user);
}

/** Scope for reading a contact row by its `organizationId` column (internal db helpers). */
export function scopeForContactOrganizationId(
  organizationId: number | null | undefined,
): TenantQueryScope {
  const id = organizationId ?? null;
  if (id != null && id > 0) {
    return { type: "tenant", organizationId: id };
  }
  return { type: "platform" };
}
