import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeBuildInfoCandidateDirs,
  findDirectoryContainingFile,
  importMetaUrlToFileDir,
  parseDeployBuildInfoObject,
  resolveDeployBuildInfo,
  SERVER_PROCESS_STARTED_AT_ISO,
} from "./deployBuildInfo";

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

describe("findDirectoryContainingFile", () => {
  it("finds package.json in parent", () => {
    const root = mkdtempSync(join(tmpdir(), "pkg-find-"));
    mkdirSync(join(root, "deep", "nest"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    expect(findDirectoryContainingFile(join(root, "deep", "nest"), "package.json")).toBe(root);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("computeBuildInfoCandidateDirs", () => {
  it("orders DEPLOY_ROOT before cwd", () => {
    const deploy = mkdtempSync(join(tmpdir(), "dep-order-"));
    const app = mkdtempSync(join(tmpdir(), "app-order-"));
    const dirs = computeBuildInfoCandidateDirs({
      cwd: app,
      importMetaUrl: pathToFileURL(join(app, "x.mjs")).href,
      deployRootEnv: deploy,
    });
    expect(dirs[0]).toBe(resolve(deploy));
    expect(dirs[1]).toBe(resolve(app));
    rmSync(deploy, { recursive: true, force: true });
    rmSync(app, { recursive: true, force: true });
  });
});

describe("importMetaUrlToFileDir", () => {
  it("returns null for non-file URLs", () => {
    expect(importMetaUrlToFileDir("https://example.com/module.js")).toBeNull();
  });

  it("returns parent directory for a valid file URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "file-url-"));
    const file = join(dir, "entry.mjs");
    writeFileSync(file, "");
    const href = pathToFileURL(file).href;
    expect(importMetaUrlToFileDir(href)).toBe(dir);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("resolveDeployBuildInfo integration", () => {
  const prevDeployRoot = process.env.DEPLOY_ROOT;

  afterEach(() => {
    if (prevDeployRoot === undefined) delete process.env.DEPLOY_ROOT;
    else process.env.DEPLOY_ROOT = prevDeployRoot;
    vi.restoreAllMocks();
  });

  it("reads build-info.json from process.cwd()", () => {
    const root = mkdtempSync(join(tmpdir(), "cwd-build-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "2.0.0" }));
    writeFileSync(
      join(root, "build-info.json"),
      JSON.stringify({
        appVersion: "from-cwd-file",
        gitCommitSha: "e".repeat(40),
        gitBranch: "main",
        buildTime: "2026-03-03T10:00:00Z",
      }),
    );
    const r = resolveDeployBuildInfo({
      cwd: root,
      importMetaUrl: pathToFileURL(join(root, "entry.mjs")).href,
      silenceLog: true,
    });
    expect(r.appVersion).toBe("from-cwd-file");
    expect(r.gitBranch).toBe("main");
    expect(r.gitCommitShortSha).toBe("eeeeeee");
    rmSync(root, { recursive: true, force: true });
  });

  it("reads build-info.json from DEPLOY_ROOT when cwd has no file", () => {
    const deployRoot = mkdtempSync(join(tmpdir(), "dep-root-"));
    const appRoot = mkdtempSync(join(tmpdir(), "app-nested-"));
    mkdirSync(join(appRoot, "dist"), { recursive: true });
    writeFileSync(join(appRoot, "package.json"), JSON.stringify({ name: "t", version: "1.0.0" }));
    writeFileSync(
      join(deployRoot, "build-info.json"),
      JSON.stringify({
        appVersion: "from-deploy-root",
        gitCommitSha: "f".repeat(40),
        gitCommitShortSha: "fffffff",
        gitBranch: "release",
        buildTime: "2026-04-04T12:00:00Z",
      }),
    );
    process.env.DEPLOY_ROOT = deployRoot;
    const r = resolveDeployBuildInfo({
      cwd: join(appRoot, "dist"),
      importMetaUrl: pathToFileURL(join(appRoot, "dist", "index.mjs")).href,
      silenceLog: true,
    });
    expect(r.appVersion).toBe("from-deploy-root");
    expect(r.gitBranch).toBe("release");
    rmSync(deployRoot, { recursive: true, force: true });
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("falls back to package.json version when build-info.json is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "no-build-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "3.1.4" }));
    const r = resolveDeployBuildInfo({
      cwd: root,
      importMetaUrl: pathToFileURL(join(root, "app.mjs")).href,
      silenceLog: true,
    });
    expect(r.appVersion).toBe("3.1.4");
    expect(r.gitCommitSha).toBeNull();
    expect(r.gitBranch).toBeNull();
    expect(r.buildTime).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("resolveDeployBuildInfo does not throw when importMetaUrl is not a file URL", () => {
    const root = mkdtempSync(join(tmpdir(), "https-import-meta-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "8.8.8" }));
    expect(() =>
      resolveDeployBuildInfo({
        cwd: root,
        importMetaUrl: "https://example.com/fake.mjs",
        silenceLog: true,
      }),
    ).not.toThrow();
    const r = resolveDeployBuildInfo({
      cwd: root,
      importMetaUrl: "https://example.com/fake.mjs",
      silenceLog: true,
    });
    expect(r.appVersion).toBe("8.8.8");
    rmSync(root, { recursive: true, force: true });
  });

  it("invalid build-info.json does not throw and yields fallbacks", () => {
    const root = mkdtempSync(join(tmpdir(), "bad-json-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "0.0.9" }));
    writeFileSync(join(root, "build-info.json"), "{ not-json");
    expect(() =>
      resolveDeployBuildInfo({
        cwd: root,
        importMetaUrl: pathToFileURL(join(root, "x.mjs")).href,
        silenceLog: true,
      }),
    ).not.toThrow();
    const r = resolveDeployBuildInfo({
      cwd: root,
      importMetaUrl: pathToFileURL(join(root, "x.mjs")).href,
      silenceLog: true,
    });
    expect(r.appVersion).toBe("0.0.9");
    expect(r.gitCommitSha).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("finds build-info via package.json ancestor when cwd is a subfolder", () => {
    const root = mkdtempSync(join(tmpdir(), "ancestor-"));
    mkdirSync(join(root, "dist", "nested"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "1.1.1" }));
    writeFileSync(
      join(root, "build-info.json"),
      JSON.stringify({
        appVersion: "ancestor-meta",
        gitCommitSha: "1".repeat(40),
        gitBranch: "main",
        buildTime: "2026-06-06T15:00:00Z",
      }),
    );
    const r = resolveDeployBuildInfo({
      cwd: join(root, "dist", "nested"),
      importMetaUrl: pathToFileURL(join(root, "dist", "nested", "run.mjs")).href,
      silenceLog: true,
    });
    expect(r.appVersion).toBe("ancestor-meta");
    expect(r.gitBranch).toBe("main");
    rmSync(root, { recursive: true, force: true });
  });
});
