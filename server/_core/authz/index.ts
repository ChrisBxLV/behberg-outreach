export {
  type TenantQueryScope,
  resolveTenantQueryScope,
  requireTenantQueryScope,
  requireSuperadminOrTenantQueryScope,
  scopeForContactOrganizationId,
  workspaceOrganizationId,
} from "./tenantScope";
export { type Permission, hasPermission, requirePermission } from "./permissions";
