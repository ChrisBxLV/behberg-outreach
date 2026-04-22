import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./services/unsubscribeToken";

describe("unsubscribeToken", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.VITEST = "1";
    process.env.JWT_SECRET = "test-jwt";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("round-trips a signed payload", () => {
    const t = createUnsubscribeToken(
      { mailboxId: 3, contactId: 9, email: "a@b.com" },
      60 * 60 * 1000,
    );
    const p = verifyUnsubscribeToken(t);
    expect(p).toMatchObject({ mailboxId: 3, contactId: 9, email: "a@b.com" });
  });

  it("rejects tampered token", () => {
    const t = createUnsubscribeToken(
      { mailboxId: 1, contactId: 1, email: "x@y.com" },
      60 * 60 * 1000,
    );
    const bad = t.slice(0, -2) + (t.at(-1) === "A" ? "B" : "A");
    expect(verifyUnsubscribeToken(bad)).toBeNull();
  });
});
