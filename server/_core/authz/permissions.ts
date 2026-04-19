import { TRPCError } from "@trpc/server";
import type { User } from "../../../drizzle/schema";
import { isOrganizationOwner, isPlatformOperatorUser } from "../orgScope";
import { workspaceOrganizationId } from "./tenantScope";

/**
 * Coarse permissions for gradual migration from string role checks.
 * Extend as routes move off `ctx.user.role` comparisons.
 */
export type Permission =
  | "platform.console"
  | "org.ownerAction"
  | "tenant.operational"
  | "system.notifyOwner";

export function hasPermission(user: User | null | undefined, perm: Permission): boolean {
  if (!user || user.accountDisabled) return false;

  switch (perm) {
    case "platform.console":
      return isPlatformOperatorUser(user);
    case "org.ownerAction":
      return isOrganizationOwner(user);
    case "tenant.operational":
      return workspaceOrganizationId(user) != null;
    case "system.notifyOwner":
      return user.role === "admin" || user.role === "superadmin";
    default:
      return false;
  }
}

export function requirePermission(user: User | null | undefined, perm: Permission): void {
  if (!hasPermission(user, perm)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission for this action." });
  }
}
