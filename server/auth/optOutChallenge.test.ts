import { describe, expect, it } from "vitest";
import { optOutChallengeKey } from "./optOutChallenge";

describe("optOutChallengeKey", () => {
  it("is deterministic and short enough for login_challenges.email (320)", () => {
    const k = optOutChallengeKey(12, "User@Example.com");
    expect(k).toMatch(/^oo:[a-f0-9]{48}$/);
    expect(k.length).toBeLessThanOrEqual(64);
    expect(optOutChallengeKey(12, "user@example.com")).toBe(k);
  });

  it("varies by mailboxId", () => {
    const a = optOutChallengeKey(1, "a@b.com");
    const b = optOutChallengeKey(2, "a@b.com");
    expect(a).not.toBe(b);
  });
});

