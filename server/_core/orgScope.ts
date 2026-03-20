import type { User } from "../../drizzle/schema";

/** When null, the user may see all rows (platform / legacy admin). When set, data is scoped to that org. */
export function dataScopeOrganizationId(user: User | null | undefined): number | null {
  const id = user?.organizationId;
  if (id == null || id <= 0) return null;
  return id;
}

export function isOrganizationOwner(user: User | null | undefined): boolean {
  return Boolean(user?.organizationId && user.orgMemberRole === "owner");
}
