import { readFileSync } from "node:fs";
import { join } from "node:path";

/** ISO time when this Node process started (stable for the lifetime of the process). */
export const SERVER_PROCESS_STARTED_AT_ISO = new Date().toISOString();

export type DeployBuildInfoPayload = {
  appVersion: string;
  gitCommitSha: string | null;
  gitCommitShortSha: string | null;
  gitBranch: string | null;
  buildTime: string | null;
  serverStartedAt: string;
};

const MAX_APP_VERSION = 160;
const MAX_BRANCH = 256;

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** Visible ASCII used in deploy tags / versions (excludes whitespace and JSON-breaking chars). */
function sanitizeAppVersion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (!/^[\w.\-+]+$/.test(t)) return null;
  return clip(t, MAX_APP_VERSION);
}

/** Git object id: hex, typical lengths 7–64. */
function sanitizeGitSha(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t.length < 7 || t.length > maxLen) return null;
  if (!/^[0-9a-f]+$/.test(t)) return null;
  return t;
}

function sanitizeGitBranch(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length > MAX_BRANCH) return null;
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(t)) return null;
  return t;
}

function sanitizeBuildTimeIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function readPackageVersion(cwd: string): string | null {
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version !== "string") return null;
    const v = parsed.version.trim();
    if (!v || v.length > 64) return null;
    if (!/^[\d.+\-a-zA-Z]+$/.test(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * Parses `build-info.json` body after JSON.parse. Unknown keys ignored.
 * Does not throw.
 */
export function parseDeployBuildInfoObject(parsed: unknown): Partial<DeployBuildInfoPayload> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const o = parsed as Record<string, unknown>;
  const appVersion = sanitizeAppVersion(o.appVersion);
  const gitCommitSha = sanitizeGitSha(o.gitCommitSha, 64);
  let gitCommitShortSha = sanitizeGitSha(o.gitCommitShortSha, 40);
  const gitBranch = sanitizeGitBranch(o.gitBranch);
  const buildTime = sanitizeBuildTimeIso(o.buildTime);

  if (gitCommitSha && !gitCommitShortSha) {
    gitCommitShortSha = gitCommitSha.slice(0, 7);
  } else if (gitCommitShortSha && gitCommitSha && !gitCommitSha.startsWith(gitCommitShortSha)) {
    gitCommitShortSha = gitCommitSha.slice(0, 7);
  }
  return {
    ...(appVersion ? { appVersion } : {}),
    ...(gitCommitSha ? { gitCommitSha } : {}),
    ...(gitCommitShortSha ? { gitCommitShortSha } : {}),
    ...(gitBranch ? { gitBranch } : {}),
    ...(buildTime ? { buildTime } : {}),
  };
}

function readBuildInfoFile(cwd: string): Partial<DeployBuildInfoPayload> {
  try {
    const raw = readFileSync(join(cwd, "build-info.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return parseDeployBuildInfoObject(parsed);
  } catch {
    return {};
  }
}

/**
 * Resolves deploy-time build metadata from `build-info.json` at the project root
 * (server `process.cwd()` in production). Safe if the file is missing or invalid.
 */
export function resolveDeployBuildInfo(cwd: string = process.cwd()): DeployBuildInfoPayload {
  const fromFile = readBuildInfoFile(cwd);
  const pkgVersion = readPackageVersion(cwd);

  const appVersion = fromFile.appVersion ?? pkgVersion ?? "unknown";

  return {
    appVersion,
    gitCommitSha: fromFile.gitCommitSha ?? null,
    gitCommitShortSha: fromFile.gitCommitShortSha ?? null,
    gitBranch: fromFile.gitBranch ?? null,
    buildTime: fromFile.buildTime ?? null,
    serverStartedAt: SERVER_PROCESS_STARTED_AT_ISO,
  };
}
