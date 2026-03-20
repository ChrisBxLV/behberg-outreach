import { describe, it, expect, vi } from "vitest";
import { pbkdf2Sync } from "node:crypto";

describe("verifyLoginCode org member OTP verification", () => {
  it("allows org credential users even if not on admin allowlist", async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "mysql://fake:user@localhost/db";
    process.env.ADMIN_ALLOWLIST = ""; // force allowlist to default admin
    process.env.DEFAULT_ADMIN_LOGIN = "behberg";
    process.env.DEFAULT_ADMIN_PASSWORD = "grebheb";
    process.env.AUTH_REQUIRE_EMAIL_OTP = "false";

    vi.resetModules();

    const upsertUser = vi.fn().mockResolvedValue(undefined);
    const getUserByEmail = vi.fn().mockResolvedValue({
      openId: "login:orgadmin@example.com",
      email: "orgadmin@example.com",
      name: "Org Admin",
      loginMethod: "password",
      role: "admin",
      organizationId: 123,
      orgMemberRole: "owner",
      passwordSalt: "salt",
      passwordHash: "hash",
    });
    const getDb = vi.fn().mockResolvedValue({});
    const verifyLoginChallenge = vi.fn().mockResolvedValue({ ok: true });
    const abandonLatestUnusedLoginChallenge = vi.fn().mockResolvedValue(undefined);

    vi.doMock("./db", () => ({
      getDb,
      getUserByEmail,
      upsertUser,
      abandonLatestUnusedLoginChallenge,
      verifyLoginChallenge,
      // other exports not used in this test
      createLoginChallenge: vi.fn(),
      getContacts: vi.fn(),
      getContactById: vi.fn(),
      createContact: vi.fn(),
      updateContact: vi.fn(),
      deleteContacts: vi.fn(),
      bulkUpdateContactStage: vi.fn(),
      getImportBatches: vi.fn(),
      getEmailLogsByContact: vi.fn(),
      getCampaigns: vi.fn(),
      getCampaignById: vi.fn(),
      createCampaign: vi.fn(),
      updateCampaign: vi.fn(),
      deleteCampaign: vi.fn(),
      getSequenceSteps: vi.fn(),
      upsertSequenceStep: vi.fn(),
      deleteSequenceStep: vi.fn(),
      deleteSequenceStepsByCampaign: vi.fn(),
      getCampaignContacts: vi.fn(),
      enrollContactsInCampaign: vi.fn(),
      updateCampaignContact: vi.fn(),
      getEmailLogsByCampaign: vi.fn(),
      markEmailReplied: vi.fn(),
      getAllContactsForSync: vi.fn(),
      getCampaignStats: vi.fn(),
      createImportBatch: vi.fn(),
      updateImportBatch: vi.fn(),
      getOrganizationById: vi.fn(),
      listOrganizationMembers: vi.fn(),
      createOrganizationRecord: vi.fn(),
      listOrganizationMembersScoped: vi.fn(),
    }));

    vi.doMock("./_core/sdk", () => ({
      sdk: {
        createSessionToken: vi.fn().mockResolvedValue("session-token"),
      },
    }));

    const { appRouter } = await import("./routers");

    const caller = appRouter.createCaller({
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as any,
      res: {
        cookie: vi.fn(),
      } as any,
    });

    const code = "123456";
    const result = await caller.auth.verifyLoginCode({
      loginId: "orgadmin@example.com",
      code,
    });

    expect(result.success).toBe(true);
    expect(verifyLoginChallenge).toHaveBeenCalled();
    expect(upsertUser).toHaveBeenCalled();
  });
});

