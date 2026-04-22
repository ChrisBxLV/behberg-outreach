import { describe, expect, it } from "vitest";
import type { User } from "../../../drizzle/schema";
import { resolveTenantQueryScope, requireTenantQueryScope } from "./tenantScope";

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "u1",
    name: "U",
    email: "u@example.com",
    phone: null,
    country: null,
    loginMethod: "password",
    passwordSalt: null,
    passwordHash: null,
    role: "user",
    accountDisabled: false,
    organizationId: null,
    orgMemberRole: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

describe("resolveTenantQueryScope", () => {
  it("returns null for non-operator without organization", () => {
    expect(resolveTenantQueryScope(baseUser({ role: "user", organizationId: null }))).toBeNull();
  });

  it("returns tenant scope for org member", () => {
    expect(resolveTenantQueryScope(baseUser({ organizationId: 7 }))).toEqual({
      type: "tenant",
      organizationId: 7,
    });
  });

  it("returns platform scope for superadmin without workspace org", () => {
    expect(resolveTenantQueryScope(baseUser({ role: "superadmin", organizationId: null }))).toEqual({
      type: "platform",
    });
  });

  it("returns tenant scope for superadmin with workspace org", () => {
    expect(resolveTenantQueryScope(baseUser({ role: "superadmin", organizationId: 3 }))).toEqual({
      type: "tenant",
      organizationId: 3,
    });
  });
});

describe("requireTenantQueryScope", () => {
  it("throws when scope cannot be resolved", () => {
    expect(() => requireTenantQueryScope(baseUser({ organizationId: null }))).toThrow(
      /Organization context required/,
    );
  });
});
