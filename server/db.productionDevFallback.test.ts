import { describe, it, expect, vi } from "vitest";

// We only validate the security constraint:
// When NODE_ENV=production, DB errors must NOT fall back to devLocalAuthStore.

describe("db dev-file fallback security", () => {
  it("in production: DB errors should throw (devLocalAuthStore must not be used)", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://fake:user@localhost/db";

    const mockDb = {
      select: () => {
        throw new Error("boom");
      },
    };

    vi.resetModules();

    const devGetUserByEmail = vi.fn().mockResolvedValue(undefined);
    vi.doMock("./devLocalAuthStore", () => ({
      devAbandonLatestUnusedChallenge: vi.fn(),
      devCreateLoginChallenge: vi.fn(),
      devCreateOrganization: vi.fn(),
      devGetOrganizationById: vi.fn(),
      devGetUserByEmail,
      devGetUserByOpenId: vi.fn(),
      devListOrganizationMembers: vi.fn(),
      devUpsertUser: vi.fn(),
      devVerifyLoginChallenge: vi.fn(),
    }));
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => mockDb),
    }));
    const dbMod = await import("./db");

    await expect(dbMod.getUserByEmail("test@example.com")).rejects.toThrow("boom");
    expect(devGetUserByEmail).not.toHaveBeenCalled();
  });

  it("in development: DB errors may fall back to devLocalAuthStore", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "mysql://fake:user@localhost/db";

    const mockDb = {
      select: () => {
        throw new Error("boom");
      },
    };

    vi.resetModules();

    const devGetUserByEmail = vi
      .fn()
      .mockResolvedValue({ id: 1, openId: "login:x", email: "test@example.com" });
    vi.doMock("./devLocalAuthStore", () => ({
      devAbandonLatestUnusedChallenge: vi.fn(),
      devCreateLoginChallenge: vi.fn(),
      devCreateOrganization: vi.fn(),
      devGetOrganizationById: vi.fn(),
      devGetUserByEmail,
      devGetUserByOpenId: vi.fn(),
      devListOrganizationMembers: vi.fn(),
      devUpsertUser: vi.fn(),
      devVerifyLoginChallenge: vi.fn(),
    }));
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => mockDb),
    }));
    const dbMod = await import("./db");

    const res = await dbMod.getUserByEmail("test@example.com");
    expect(devGetUserByEmail).toHaveBeenCalledTimes(1);
    expect(res).toEqual(
      expect.objectContaining({
        email: "test@example.com",
      }),
    );
  });
});

