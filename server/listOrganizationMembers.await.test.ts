import { describe, it, expect, vi } from "vitest";

// Create a mock DB that behaves like Drizzle's builder chain:
// db.select(...).from(...).where(...) returns something that is only resolved when awaited.
const resolved = [
  {
    id: 1,
    email: "a@example.com",
    name: "A",
    orgMemberRole: "owner",
    lastSignedIn: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const thenable = {
  then: (resolve: (v: typeof resolved) => void) => resolve(resolved),
};

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => thenable,
    }),
  }),
};

// Mock drizzle(...) so getDb() returns our mockDb.
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => mockDb),
}));

describe("listOrganizationMembers awaits DB result", () => {
  it("returns the resolved member array (not a query builder)", async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "mysql://fake:user@localhost/db";

    vi.resetModules();
    const dbMod = await import("./db");

    const members = await dbMod.listOrganizationMembers(123);
    expect(members).toEqual(resolved);
  });
});

