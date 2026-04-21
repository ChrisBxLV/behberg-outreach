import { afterEach, describe, expect, it } from "vitest";
import { getProviderReadinessReasons, tokenEncryptionConfigured } from "./services/mailboxConnectFlow";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("mailbox connect readiness helpers", () => {
  it("requires app base url, provider config, and encryption secret", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    delete process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;

    const reasons = getProviderReadinessReasons("google");
    expect(reasons).toContain("missing_app_base_url");
    expect(reasons).toContain("missing_provider_config");
    expect(reasons).toContain("missing_encryption_secret");
    expect(tokenEncryptionConfigured()).toBe(false);
  });

  it("accepts JWT_SECRET as encryption fallback", () => {
    process.env.APP_BASE_URL = "https://krot.io";
    process.env.GOOGLE_MAIL_CLIENT_ID = "g-id";
    process.env.GOOGLE_MAIL_CLIENT_SECRET = "g-secret";
    delete process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
    process.env.JWT_SECRET = "jwt-fallback";

    const reasons = getProviderReadinessReasons("google");
    expect(reasons).toEqual([]);
    expect(tokenEncryptionConfigured()).toBe(true);
  });
});
