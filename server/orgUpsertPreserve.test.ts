import { describe, expect, it, vi, beforeEach } from "vitest";
import { pbkdf2Sync } from "node:crypto";

// Ensure ENV is set before importing router.
process.env.NODE_ENV = "test";
process.env.AUTH_REQUIRE_EMAIL_OTP = "false";
process.env.DEFAULT_ADMIN_LOGIN = "behberg";
process.env.DEFAULT_ADMIN_PASSWORD = "grebheb";

describe("org-scoped sign-in upsert", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("password sign-in preserves organizationId + orgMemberRole by passing them to upsertUser", async () => {
    const loginId = "behberg";
    const password = "grebheb";
    const salt = "deadbeefdeadbeef";
    const iterations = 310_000;
    const derivedKeyBytes = 32;
    const hash = pbkdf2Sync(password, salt, iterations, derivedKeyBytes, "sha256").toString("base64");

    const user = {
      id: 1,
      openId: "login:behberg",
      email: loginId,
      name: "Behberg",
      loginMethod: "password",
      passwordSalt: salt,
      passwordHash: hash,
      role: "admin" as const,
      organizationId: 123,
      orgMemberRole: "owner" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const upsertUserMock = vi.fn().mockResolvedValue(undefined);
    const getUserByEmailMock = vi.fn().mockResolvedValue(user);
    const getDbMock = vi.fn().mockResolvedValue({}); // truthy

    vi.doMock("./db", async () => ({
      getDb: getDbMock,
      getUserByEmail: getUserByEmailMock,
      upsertUser: upsertUserMock,
      abandonLatestUnusedLoginChallenge: vi.fn(),
      createLoginChallenge: vi.fn(),
      verifyLoginChallenge: vi.fn(),
      // unused in this test:
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

    vi.doMock("./_core/sdk", async () => ({
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
        ip: "127.0.0.1",
      },
      res: {
        cookie: vi.fn(),
      },
    } as any);

    const result = await caller.auth.requestLoginCode({ loginId, password });
    expect(result.success).toBe(true);

    // The fix ensures org fields are passed on update.
    expect(upsertUserMock).toHaveBeenCalled();
    const firstCallArg = upsertUserMock.mock.calls[0]?.[0] as any;
    expect(firstCallArg.organizationId).toBe(123);
    expect(firstCallArg.orgMemberRole).toBe("owner");
  });
});

