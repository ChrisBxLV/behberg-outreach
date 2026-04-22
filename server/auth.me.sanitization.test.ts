import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "login:secure-user",
      email: "secure@example.com",
      name: "Secure User",
      phone: null,
      country: null,
      loginMethod: "password",
      passwordSalt: "sensitive-salt",
      passwordHash: "sensitive-hash",
      role: "admin",
      organizationId: 12,
      orgMemberRole: "owner",
      accountDisabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.me sanitization", () => {
  it("does not expose password fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const me = await caller.auth.me();
    expect(me).not.toBeNull();
    expect(me).not.toHaveProperty("passwordSalt");
    expect(me).not.toHaveProperty("passwordHash");
    expect(me?.email).toBe("secure@example.com");
  });
});
