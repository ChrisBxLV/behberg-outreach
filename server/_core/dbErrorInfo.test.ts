import { describe, expect, it } from "vitest";
import { summarizeDbError } from "./dbErrorInfo";

describe("summarizeDbError", () => {
  it("picks driver fields from a Drizzle wrapper with mysql2 cause", () => {
    const cause = Object.assign(new Error("Unknown column 'prospect_employees.sourceConfidence' in 'field list'"), {
      code: "ER_BAD_FIELD_ERROR",
      errno: 1054,
      sqlState: "42S22",
      sqlMessage: "Unknown column 'prospect_employees.sourceConfidence' in 'field list'",
    });
    const err = Object.assign(new Error("Failed query: select ... from `prospect_employees` ..."), {
      name: "DrizzleQueryError",
      cause,
    });

    expect(summarizeDbError(err)).toEqual({
      name: "DrizzleQueryError",
      code: "ER_BAD_FIELD_ERROR",
      errno: 1054,
      sqlState: "42S22",
      message: "Unknown column 'prospect_employees.sourceConfidence' in 'field list'",
    });
  });

  it("falls back to the wrapper's message when there is no cause", () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:3306");
    expect(summarizeDbError(err)).toEqual({
      name: "Error",
      message: "connect ECONNREFUSED 127.0.0.1:3306",
    });
  });

  it("uses driver fields from a flat mysql2 error", () => {
    const err = Object.assign(new Error("Table 'app.prospect_employees' doesn't exist"), {
      code: "ER_NO_SUCH_TABLE",
      errno: 1146,
      sqlState: "42S02",
    });
    expect(summarizeDbError(err)).toEqual({
      name: "Error",
      code: "ER_NO_SUCH_TABLE",
      errno: 1146,
      sqlState: "42S02",
      message: "Table 'app.prospect_employees' doesn't exist",
    });
  });

  it("handles non-Error throwables (string / null / undefined)", () => {
    expect(summarizeDbError("boom")).toEqual({ name: "Error", message: "boom" });
    expect(summarizeDbError(null)).toEqual({ name: "Error", message: "unknown_db_error" });
    expect(summarizeDbError(undefined)).toEqual({ name: "Error", message: "unknown_db_error" });
  });

  it("truncates very long messages but keeps diagnostic fields intact", () => {
    const huge = "x".repeat(2000);
    const err = Object.assign(new Error(huge), {
      code: "ER_BAD_FIELD_ERROR",
      sqlState: "42S22",
    });
    const info = summarizeDbError(err);
    expect(info.message.length).toBeLessThanOrEqual(500);
    expect(info.message.endsWith("…")).toBe(true);
    expect(info.code).toBe("ER_BAD_FIELD_ERROR");
    expect(info.sqlState).toBe("42S22");
  });

  it("does not surface sql / params / stack fields", () => {
    const err = Object.assign(new Error("Failed query"), {
      sql: "select * from `users` where `password_hash` = ?",
      params: ["super-secret"],
      stack: "Error: Failed query\n    at /app/server/db.ts:42:7",
      code: "ER_BAD_FIELD_ERROR",
    });
    const info = summarizeDbError(err) as Record<string, unknown>;
    expect(info.sql).toBeUndefined();
    expect(info.params).toBeUndefined();
    expect(info.stack).toBeUndefined();
    expect(info.code).toBe("ER_BAD_FIELD_ERROR");
  });
});
