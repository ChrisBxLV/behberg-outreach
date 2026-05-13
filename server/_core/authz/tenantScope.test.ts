import { describe, expect, it } from "vitest";
import type { User } from "../../../drizzle/schema";
import {
  requireSuperadminOrTenantQueryScope,
  requireTenantQueryScope,
  resolveTenantQueryScope,
} from "./tenantScope";

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
    positiveRepliesLastSeenAt: null,
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

describe("requireSuperadminOrTenantQueryScope", () => {
  it("returns platform scope for active superadmin even with workspace org", () => {
    expect(
      requireSuperadminOrTenantQueryScope(
        baseUser({ role: "superadmin", organizationId: 5 }),
      ),
    ).toEqual({ type: "platform" });
  });

  it("returns platform scope for active superadmin without workspace org", () => {
    expect(
      requireSuperadminOrTenantQueryScope(
        baseUser({ role: "superadmin", organizationId: null }),
      ),
    ).toEqual({ type: "platform" });
  });

  it("does not bypass workspace scope for disabled superadmin", () => {
    expect(
      requireSuperadminOrTenantQueryScope(
        baseUser({ role: "superadmin", organizationId: 9, accountDisabled: true }),
      ),
    ).toEqual({ type: "tenant", organizationId: 9 });
  });

  it("returns tenant scope for a regular org member", () => {
    expect(
      requireSuperadminOrTenantQueryScope(
        baseUser({ role: "admin", organizationId: 11, orgMemberRole: "owner" }),
      ),
    ).toEqual({ type: "tenant", organizationId: 11 });
  });

  it("throws for a non-operator user without organization", () => {
    expect(() =>
      requireSuperadminOrTenantQueryScope(baseUser({ role: "user", organizationId: null })),
    ).toThrow(/Organization context required/);
  });
});
