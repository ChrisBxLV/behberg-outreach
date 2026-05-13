import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const baseUser: Pick<
  User,
  | "id"
  | "openId"
  | "email"
  | "name"
  | "loginMethod"
  | "passwordSalt"
  | "passwordHash"
  | "role"
  | "organizationId"
  | "orgMemberRole"
  | "accountDisabled"
  | "createdAt"
  | "updatedAt"
  | "lastSignedIn"
  | "positiveRepliesLastSeenAt"
> = {
  id: 1,
  openId: "login:behberg",
  email: "behberg",
  name: "behberg",
  loginMethod: "password",
  passwordSalt: "s",
  passwordHash: "h",
  role: "admin",
  organizationId: null,
  orgMemberRole: null,
  accountDisabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  positiveRepliesLastSeenAt: null,
};

describe("isPlatformOperatorUser", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("matches default operator when DEFAULT_ADMIN_LOGIN is empty in env", async () => {
    vi.stubEnv("DEFAULT_ADMIN_LOGIN", "");
    const { isPlatformOperatorUser } = await import("./_core/orgScope");
    expect(isPlatformOperatorUser(baseUser as User)).toBe(true);
  });

  it("matches login openId case-insensitively", async () => {
    const { isPlatformOperatorUser } = await import("./_core/orgScope");
    expect(
      isPlatformOperatorUser({
        ...baseUser,
        openId: "Login:Behberg",
        email: "other@x.com",
      } as User),
    ).toBe(true);
  });

  it("matches email local-part to configured default login", async () => {
    const { isPlatformOperatorUser } = await import("./_core/orgScope");
    expect(
      isPlatformOperatorUser({
        ...baseUser,
        openId: "oauth:x",
        email: "behberg@company.com",
      } as User),
    ).toBe(true);
  });

  it("denies platform access when account is disabled", async () => {
    const { isPlatformOperatorUser } = await import("./_core/orgScope");
    expect(
      isPlatformOperatorUser({
        ...(baseUser as User),
        role: "superadmin",
        accountDisabled: true,
      }),
    ).toBe(false);
  });
});

describe("resolvedElevatedRoleAfterPasswordLogin", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("promotes strict default operator row from admin to superadmin on sign-in", async () => {
    vi.stubEnv("DEFAULT_ADMIN_LOGIN", "behberg");
    const { resolvedElevatedRoleAfterPasswordLogin } = await import("./_core/orgScope");
    expect(
      resolvedElevatedRoleAfterPasswordLogin(baseUser as User, "behberg"),
    ).toBe("superadmin");
  });

  it("does not promote behberg@company.com OAuth row when login id is behberg", async () => {
    vi.stubEnv("DEFAULT_ADMIN_LOGIN", "behberg");
    const { resolvedElevatedRoleAfterPasswordLogin } = await import("./_core/orgScope");
    expect(
      resolvedElevatedRoleAfterPasswordLogin(
        {
          ...baseUser,
          openId: "oauth:x",
          email: "behberg@company.com",
          role: "admin",
        } as User,
        "behberg",
      ),
    ).toBe("admin");
  });

  it("keeps superadmin for other workspace admins", async () => {
    vi.stubEnv("DEFAULT_ADMIN_LOGIN", "behberg");
    const { resolvedElevatedRoleAfterPasswordLogin } = await import("./_core/orgScope");
    expect(
      resolvedElevatedRoleAfterPasswordLogin(
        {
          ...baseUser,
          openId: "login:other",
          email: "other",
          role: "superadmin",
        } as User,
        "other",
      ),
    ).toBe("superadmin");
  });
});

describe("isPlatformOperatorUser (Firebase display name)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats Firebase user with matching display name as platform operator when email is missing", async () => {
    vi.stubEnv("DEFAULT_ADMIN_LOGIN", "behberg");
    const { isPlatformOperatorUser } = await import("./_core/orgScope");
    expect(
      isPlatformOperatorUser({
        ...baseUser,
        openId: "firebase:abc123",
        email: null,
        name: "behberg",
        role: "user",
      } as User),
    ).toBe(true);
  });
});

describe("isActivePlatformSuperadmin", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is true only for active superadmin role", async () => {
    const { isActivePlatformSuperadmin } = await import("./_core/orgScope");
    expect(
      isActivePlatformSuperadmin({ ...baseUser, role: "superadmin" } as User),
    ).toBe(true);
  });

  it("is false for disabled superadmin", async () => {
    const { isActivePlatformSuperadmin } = await import("./_core/orgScope");
    expect(
      isActivePlatformSuperadmin({
        ...baseUser,
        role: "superadmin",
        accountDisabled: true,
      } as User),
    ).toBe(false);
  });

  it("is false for default-operator-by-login admin (no superadmin role yet)", async () => {
    vi.stubEnv("DEFAULT_ADMIN_LOGIN", "behberg");
    const { isActivePlatformSuperadmin, isPlatformOperatorUser } = await import(
      "./_core/orgScope"
    );
    const operatorByLogin = baseUser as User;
    expect(isPlatformOperatorUser(operatorByLogin)).toBe(true);
    expect(isActivePlatformSuperadmin(operatorByLogin)).toBe(false);
  });

  it("is false for org admin without superadmin role", async () => {
    const { isActivePlatformSuperadmin } = await import("./_core/orgScope");
    expect(
      isActivePlatformSuperadmin({
        ...baseUser,
        openId: "login:other",
        email: "other@example.com",
        name: "Other",
        role: "admin",
        organizationId: 4,
        orgMemberRole: "owner",
      } as User),
    ).toBe(false);
  });
});
