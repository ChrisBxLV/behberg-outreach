import { describe, expect, it, vi, beforeEach } from "vitest";

describe("subscription email checker gating", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("hasEmailCheckerAccess allows basic+", async () => {
    const { hasEmailCheckerAccess } = await import("./subscription");
    expect(hasEmailCheckerAccess("basic")).toBe(true);
    expect(hasEmailCheckerAccess("business_standard")).toBe(true);
    expect(hasEmailCheckerAccess("pro")).toBe(true);
    expect(hasEmailCheckerAccess("free")).toBe(false);
  });

  it("assertEmailCheckerAccess denies free plan", async () => {
    vi.doMock("../db", () => ({
      getOrganizationById: async () => ({ id: 1, name: "x", subscriptionPlanId: "free", createdAt: new Date() }),
    }));
    const { assertEmailCheckerAccess } = await import("./subscription");
    await expect(assertEmailCheckerAccess(1)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

