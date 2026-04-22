import { describe, expect, it, vi, beforeEach } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserByEmail: vi.fn(),
  upsertUser: vi.fn(),
  getDb: vi.fn(),
  createSessionToken: vi.fn(),
  updateUserOpenId: vi.fn(),
}));

vi.mock("./_core/firebaseAdmin", () => ({
  isFirebaseServerAuthConfigured: vi.fn(() => true),
  isFirebaseSignInProviderAllowed: vi.fn(() => true),
  firebaseProviderRequiresVerifiedEmail: vi.fn(() => true),
  firebaseLoginMethodFromDecoded: vi.fn(() => "firebase_google_com"),
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
    getUserByOpenId: mocks.getUserByOpenId,
    getUserByEmail: mocks.getUserByEmail,
    upsertUser: mocks.upsertUser,
    updateUserOpenId: mocks.updateUserOpenId,
  };
});

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: mocks.createSessionToken,
  },
}));

import { appRouter } from "./routers";

function makeUser(partial: Partial<User> & Pick<User, "openId">): User {
  const now = new Date();
  return {
    id: partial.id ?? 1,
    openId: partial.openId,
    name: partial.name ?? null,
    email: partial.email ?? null,
    phone: partial.phone ?? null,
    country: partial.country ?? null,
    loginMethod: partial.loginMethod ?? null,
    passwordSalt: partial.passwordSalt ?? null,
    passwordHash: partial.passwordHash ?? null,
    role: partial.role ?? "user",
    accountDisabled: partial.accountDisabled ?? false,
    organizationId: partial.organizationId ?? null,
    orgMemberRole: partial.orgMemberRole ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    lastSignedIn: partial.lastSignedIn ?? now,
    positiveRepliesLastSeenAt: partial.positiveRepliesLastSeenAt ?? null,
  };
}

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const idToken = "x".repeat(50);

describe("auth.signInWithFirebase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({});
    mocks.verifyFirebaseIdToken.mockResolvedValue({
      uid: "abc123",
      email: "new@example.com",
      email_verified: true,
      name: "New User",
      firebase: { sign_in_provider: "google.com" },
    });
    mocks.createSessionToken.mockResolvedValue("jwt-session");
    mocks.upsertUser.mockResolvedValue(undefined);
  });

  it("provisions a new user, returns profileIncomplete, and sets session cookie", async () => {
    const created = makeUser({
      id: 99,
      openId: "firebase:abc123",
      email: "new@example.com",
      name: "New User",
      phone: null,
      country: null,
    });
    mocks.getUserByOpenId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(created)
      .mockResolvedValue(created);
    mocks.getUserByEmail.mockResolvedValue(undefined);

    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const r = await caller.auth.signInWithFirebase({ idToken });

    expect(r).toEqual({ success: true, profileIncomplete: true });
    expect(mocks.upsertUser).toHaveBeenCalled();
    expect(mocks.createSessionToken).toHaveBeenCalledWith(
      "firebase:abc123",
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(ctx.res.cookie).toHaveBeenCalledWith(COOKIE_NAME, "jwt-session", expect.any(Object));
  });

  it("links an existing email user to the firebase openId", async () => {
    const emailOwner = makeUser({
      id: 2,
      openId: "login:someone@example.com",
      email: "new@example.com",
      phone: "+15550001111",
      country: "US",
    });
    const linked = { ...emailOwner, openId: "firebase:abc123" };
    mocks.getUserByOpenId.mockResolvedValueOnce(undefined).mockResolvedValueOnce(linked).mockResolvedValue(linked);
    mocks.getUserByEmail.mockResolvedValue(emailOwner);
    mocks.updateUserOpenId.mockResolvedValue(undefined);

    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const r = await caller.auth.signInWithFirebase({ idToken });

    expect(mocks.updateUserOpenId).toHaveBeenCalledWith("login:someone@example.com", "firebase:abc123");
    expect(r).toEqual({ success: true, profileIncomplete: false });
    expect(ctx.res.cookie).toHaveBeenCalledWith(COOKIE_NAME, "jwt-session", expect.any(Object));
  });

  it("allows new firebase user when email is absent from token (no collision check)", async () => {
    mocks.verifyFirebaseIdToken.mockResolvedValue({
      uid: "noemail",
      email: undefined,
      name: "Mystery",
      firebase: { sign_in_provider: "microsoft.com" },
    });
    const created = makeUser({
      id: 100,
      openId: "firebase:noemail",
      email: null,
      name: "Mystery",
      phone: null,
      country: null,
    });
    mocks.getUserByOpenId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(created)
      .mockResolvedValue(created);

    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const r = await caller.auth.signInWithFirebase({ idToken });

    expect(r.success).toBe(true);
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it("returns account_disabled for disabled users", async () => {
    const active = makeUser({
      id: 1,
      openId: "firebase:abc123",
      email: "u@example.com",
      accountDisabled: false,
    });
    const disabled = { ...active, accountDisabled: true };
    mocks.getUserByOpenId.mockResolvedValueOnce(active).mockResolvedValueOnce(disabled);
    mocks.getUserByEmail.mockResolvedValue(undefined);

    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const r = await caller.auth.signInWithFirebase({ idToken });

    expect(r).toEqual({ success: false, reason: "account_disabled" });
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("returns profileIncomplete false when phone and country are set", async () => {
    const u = makeUser({
      id: 1,
      openId: "firebase:abc123",
      email: "u@example.com",
      phone: "+15550001111",
      country: "US",
    });
    mocks.getUserByOpenId.mockResolvedValue(u);
    mocks.getUserByEmail.mockResolvedValue(undefined);

    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const r = await caller.auth.signInWithFirebase({ idToken });

    expect(r).toEqual({ success: true, profileIncomplete: false });
  });
});
