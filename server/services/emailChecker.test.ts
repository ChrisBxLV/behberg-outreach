import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:dns/promises", () => {
  return {
    resolveMx: vi.fn(),
    resolveAny: vi.fn(),
  };
});

describe("emailChecker.verifyEmailLightweight", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("marks invalid syntax as invalid", async () => {
    const { verifyEmailLightweight } = await import("./emailChecker");
    const res = await verifyEmailLightweight({ email: "not-an-email" });
    expect(res.status).toBe("invalid");
    expect(res.reason).toBe("syntax_invalid");
  });

  it("marks disposable domains as risky", async () => {
    const { verifyEmailLightweight } = await import("./emailChecker");
    const res = await verifyEmailLightweight({ email: "a@mailinator.com" });
    expect(res.status).toBe("risky");
    expect(res.reason).toBe("disposable_domain");
    expect(res.confidence).toBeGreaterThan(0);
  });

  it("marks domains without MX/A as invalid", async () => {
    const { resolveMx, resolveAny } = (await import("node:dns/promises")) as unknown as {
      resolveMx: ReturnType<typeof vi.fn>;
      resolveAny: ReturnType<typeof vi.fn>;
    };
    resolveMx.mockReset();
    resolveAny.mockReset();
    resolveMx.mockRejectedValueOnce(new Error("no mx"));
    resolveAny.mockRejectedValueOnce(new Error("no a"));

    const { verifyEmailLightweight } = await import("./emailChecker");
    const res = await verifyEmailLightweight({ email: "a@no-such-domain.example" });
    expect(res.status).toBe("invalid");
    expect(res.reason).toBe("domain_no_mx_or_a");
  });

  it("marks MX-present domains as risky with higher confidence on domain match", async () => {
    const { resolveMx, resolveAny } = (await import("node:dns/promises")) as unknown as {
      resolveMx: ReturnType<typeof vi.fn>;
      resolveAny: ReturnType<typeof vi.fn>;
    };
    resolveMx.mockReset();
    resolveAny.mockReset();
    resolveMx.mockResolvedValueOnce([{ exchange: "mx.example.com", priority: 10 }]);

    const { verifyEmailLightweight } = await import("./emailChecker");
    const res = await verifyEmailLightweight({
      email: "ceo@example.com",
      expectedCompanyDomain: "example.com",
    });
    expect(res.status).toBe("risky");
    expect(res.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

