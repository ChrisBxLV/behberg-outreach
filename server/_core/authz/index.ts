export {
  type TenantQueryScope,
  resolveTenantQueryScope,
  requireTenantQueryScope,
  scopeForContactOrganizationId,
  workspaceOrganizationId,
} from "./tenantScope";
export { type Permission, hasPermission, requirePermission } from "./permissions";
