import { TRPCError } from "@trpc/server";
import type { User } from "../../../drizzle/schema";
import { isPlatformOperatorUser } from "../orgScope";

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
