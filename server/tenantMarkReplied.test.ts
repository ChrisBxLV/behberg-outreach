import { describe, expect, it, vi, beforeEach } from "vitest";

describe("tenant isolation: markEmailReplied", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("throws when emailLog belongs to a different organization", async () => {
    process.env.DATABASE_URL = "mysql://fake:user@localhost/fake";
    process.env.NODE_ENV = "test";

    const fakeRow = {
      log: {
        id: 1,
        campaignId: 55,
        campaignContactId: null,
        repliedAt: null,
        createdAt: new Date(),
      } as any,
      campaign: {
        id: 55,
        organizationId: 200,
      } as any,
    };

    const updateCalls: any[] = [];

    const fakeDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [fakeRow],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => {
            updateCalls.push(true);
          },
        }),
      }),
    } as any;

    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => fakeDb),
    }));

    const dbModule = await import("./db");
    const { markEmailReplied } = dbModule;

    await expect(markEmailReplied(1, 100)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Should have blocked before any updates.
    expect(updateCalls.length).toBe(0);
  });
});

