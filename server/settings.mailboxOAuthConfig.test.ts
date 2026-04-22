import { afterEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const ORIGINAL_ENV = { ...process.env };

function makeCtx(organizationId: number | null): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "login:test",
      email: "test@example.com",
      name: "Test",
      loginMethod: "password",
      passwordSalt: null,
      passwordHash: null,
      role: "admin",
      organizationId,
      orgMemberRole: organizationId ? "owner" : null,
      accountDisabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      positiveRepliesLastSeenAt: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("settings.getMailboxOAuthConfig", () => {
  it("includes readiness reasons when org context is missing", async () => {
    process.env.APP_BASE_URL = "https://krot.io";
    process.env.GOOGLE_MAIL_CLIENT_ID = "g-id";
    process.env.GOOGLE_MAIL_CLIENT_SECRET = "g-secret";
    process.env.MS_MAIL_CLIENT_ID = "m-id";
    process.env.MS_MAIL_CLIENT_SECRET = "m-secret";
    process.env.JWT_SECRET = "jwt-fallback";

    const caller = appRouter.createCaller(makeCtx(null));
    const config = await caller.settings.getMailboxOAuthConfig();

    expect(config.googleConfigured).toBe(true);
    expect(config.microsoftConfigured).toBe(true);
    expect(config.tokenEncryptionConfigured).toBe(true);
    expect(config.readinessReasons.google).toContain("organization_context_required");
    expect(config.readinessReasons.microsoft).toContain("organization_context_required");
  });

  it("returns empty readiness reasons when fully configured", async () => {
    process.env.APP_BASE_URL = "https://krot.io";
    process.env.GOOGLE_MAIL_CLIENT_ID = "g-id";
    process.env.GOOGLE_MAIL_CLIENT_SECRET = "g-secret";
    process.env.MS_MAIL_CLIENT_ID = "m-id";
    process.env.MS_MAIL_CLIENT_SECRET = "m-secret";
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = "mailbox-key";

    const caller = appRouter.createCaller(makeCtx(10));
    const config = await caller.settings.getMailboxOAuthConfig();

    expect(config.readinessReasons.google).toEqual([]);
    expect(config.readinessReasons.microsoft).toEqual([]);
    expect(config.googleCallbackUrl).toBe("https://krot.io/api/mailboxes/oauth/google/callback");
  });
});
