import { describe, expect, it } from "vitest";
import { passwordResetChallengeKey } from "./passwordResetChallenge";

describe("passwordResetChallengeKey", () => {
  it("is deterministic and short enough for login_challenges.email (320)", () => {
    const k = passwordResetChallengeKey("behberg@x.com");
    expect(k).toMatch(/^pr:[a-f0-9]{48}$/);
    expect(k.length).toBeLessThanOrEqual(64);
    expect(passwordResetChallengeKey("behberg@x.com")).toBe(k);
  });
});
