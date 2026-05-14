import { describe, expect, it } from "vitest";
import { composeBuildInfo } from "./buildInfoCompose";

describe("composeBuildInfo", () => {
  it("composes vMAJOR.MINOR.<count> from package.json + git", () => {
    const info = composeBuildInfo({
      packageVersion: "0.1.0",
      commitCount: 42,
      commitSha: "abc1234",
      now: new Date("2026-05-13T10:00:00.000Z"),
    });
    expect(info).toEqual({
      version: "v0.1.42",
      commit: "abc1234",
      buildTime: "2026-05-13T10:00:00.000Z",
      commitCount: 42,
    });
  });

  it("preserves major.minor for non-0.x package versions (e.g. 1.0.0)", () => {
    const info = composeBuildInfo({
      packageVersion: "1.0.0",
      commitCount: 7,
      commitSha: "deadbee",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(info.version).toBe("v1.0.7");
  });

  it("falls back to v<prefix>.0-dev when commit count is unavailable", () => {
    const info = composeBuildInfo({
      packageVersion: "0.1.0",
      commitCount: null,
      commitSha: null,
      now: new Date("2026-05-13T10:00:00.000Z"),
    });
    expect(info).toEqual({
      version: "v0.1.0-dev",
      commit: null,
      buildTime: "2026-05-13T10:00:00.000Z",
      commitCount: null,
    });
  });

  it("falls back to v0.0 prefix when package version is unparseable", () => {
    const info = composeBuildInfo({
      packageVersion: "garbage",
      commitCount: 9,
      commitSha: "x",
      now: null,
    });
    expect(info.version).toBe("v0.0.9");
  });

  it("returns null buildTime when no Date is provided", () => {
    const info = composeBuildInfo({
      packageVersion: "0.1.0",
      commitCount: 1,
      commitSha: "x",
      now: null,
    });
    expect(info.buildTime).toBeNull();
  });

  it("trims and rejects empty commit sha", () => {
    expect(
      composeBuildInfo({
        packageVersion: "0.1.0",
        commitCount: 1,
        commitSha: "  ",
        now: null,
      }).commit,
    ).toBeNull();
    expect(
      composeBuildInfo({
        packageVersion: "0.1.0",
        commitCount: 1,
        commitSha: "  abc123 ",
        now: null,
      }).commit,
    ).toBe("abc123");
  });

  it("rejects negative / non-finite / non-integer commit counts", () => {
    expect(
      composeBuildInfo({
        packageVersion: "0.1.0",
        commitCount: -1,
        commitSha: null,
        now: null,
      }).commitCount,
    ).toBeNull();
    expect(
      composeBuildInfo({
        packageVersion: "0.1.0",
        commitCount: Number.NaN,
        commitSha: null,
        now: null,
      }).commitCount,
    ).toBeNull();
    expect(
      composeBuildInfo({
        packageVersion: "0.1.0",
        commitCount: 12.7,
        commitSha: null,
        now: null,
      }).commitCount,
    ).toBe(12);
  });
});
