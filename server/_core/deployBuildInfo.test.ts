import { describe, expect, it } from "vitest";
import { parseDeployBuildInfoObject, SERVER_PROCESS_STARTED_AT_ISO } from "./deployBuildInfo";

describe("parseDeployBuildInfoObject", () => {
  it("accepts a well-formed deploy record", () => {
    const r = parseDeployBuildInfoObject({
      appVersion: "2026.05.14-a1b2c3d",
      gitCommitSha: "a".repeat(40),
      gitCommitShortSha: "aaaaaaaa",
      gitBranch: "main",
      buildTime: "2026-05-14T12:40:00.000Z",
    });
    expect(r.appVersion).toBe("2026.05.14-a1b2c3d");
    expect(r.gitCommitSha).toHaveLength(40);
    expect(r.gitCommitShortSha).toBe("aaaaaaaa");
    expect(r.gitBranch).toBe("main");
    expect(r.buildTime).toBe("2026-05-14T12:40:00.000Z");
  });

  it("derives short sha from full when short missing", () => {
    const full = "b".repeat(40);
    const r = parseDeployBuildInfoObject({
      appVersion: "1.0.0",
      gitCommitSha: full,
      buildTime: "2026-01-01T00:00:00Z",
    });
    expect(r.gitCommitShortSha).toBe("bbbbbbb");
  });

  it("repairs mismatched short sha using full sha prefix", () => {
    const full = "c".repeat(40);
    const r = parseDeployBuildInfoObject({
      appVersion: "1.0.0",
      gitCommitSha: full,
      gitCommitShortSha: "deadbeef",
    });
    expect(r.gitCommitShortSha).toBe("ccccccc");
  });

  it("rejects invalid sha and hostile strings", () => {
    expect(parseDeployBuildInfoObject({ gitCommitSha: "not-hex" }).gitCommitSha).toBeUndefined();
    expect(parseDeployBuildInfoObject({ gitCommitSha: "ab" }).gitCommitSha).toBeUndefined();
    expect(parseDeployBuildInfoObject({ appVersion: 'x";DROP--' }).appVersion).toBeUndefined();
    expect(parseDeployBuildInfoObject({ gitBranch: "x y" }).gitBranch).toBeUndefined();
  });

  it("returns empty for non-object JSON roots", () => {
    expect(parseDeployBuildInfoObject(null)).toEqual({});
    expect(parseDeployBuildInfoObject([])).toEqual({});
    expect(parseDeployBuildInfoObject("x")).toEqual({});
  });
});

describe("SERVER_PROCESS_STARTED_AT_ISO", () => {
  it("is a parseable ISO string", () => {
    expect(Number.isFinite(Date.parse(SERVER_PROCESS_STARTED_AT_ISO))).toBe(true);
  });
});
