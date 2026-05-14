import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

let resolutionLogged = false;

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

/**
 * Walks upward from `startDir` (inclusive) until a directory containing `filename` exists.
 */
export function findDirectoryContainingFile(startDir: string, filename: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, filename))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Directory of the module file for a valid `file:` import URL.
 * Returns null if the URL is missing, not a `file:` URL, or otherwise invalid for `fileURLToPath`.
 */
export function importMetaUrlToFileDir(importMetaUrl: string): string | null {
  try {
    return dirname(fileURLToPath(importMetaUrl));
  } catch {
    return null;
  }
}

function readPackageVersionInDir(dir: string): string | null {
  try {
    const raw = readFileSync(join(dir, "package.json"), "utf-8");
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
 * Ordered unique candidate **directories** that may contain `build-info.json`.
 * Order: DEPLOY_ROOT → cwd → nearest package.json root from cwd → same from `importMetaUrl` file dir.
 */
export function computeBuildInfoCandidateDirs(opts: {
  cwd: string;
  importMetaUrl: string;
  deployRootEnv?: string | null;
}): string[] {
  const ordered: string[] = [];
  const push = (p: string | null | undefined) => {
    if (typeof p !== "string") return;
    const t = p.trim();
    if (!t) return;
    ordered.push(resolve(t));
  };

  push(opts.deployRootEnv ?? undefined);
  push(opts.cwd);

  const cwdPkg = findDirectoryContainingFile(opts.cwd, "package.json");
  if (cwdPkg) push(cwdPkg);

  const importMetaDir = importMetaUrlToFileDir(opts.importMetaUrl);
  const importDir = importMetaDir ?? resolve(opts.cwd);
  const importPkg = findDirectoryContainingFile(importDir, "package.json");
  if (importPkg) push(importPkg);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of ordered) {
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

type ReadAttempt = { filePath: string; outcome: "missing" | "invalid_json" | "ok" };

function tryReadBuildInfoJsonAtRoot(rootDir: string): {
  partial: Partial<DeployBuildInfoPayload>;
  attempt: ReadAttempt;
} {
  const filePath = join(resolve(rootDir), "build-info.json");
  if (!existsSync(filePath)) {
    return { partial: {}, attempt: { filePath, outcome: "missing" } };
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return {
      partial: parseDeployBuildInfoObject(parsed),
      attempt: { filePath, outcome: "ok" },
    };
  } catch {
    return { partial: {}, attempt: { filePath, outcome: "invalid_json" } };
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

function readFirstOrderedBuildInfo(
  candidateDirs: string[],
): { partial: Partial<DeployBuildInfoPayload>; usedPath: string | null; attempts: ReadAttempt[] } {
  const attempts: ReadAttempt[] = [];
  for (const dir of candidateDirs) {
    const { partial, attempt } = tryReadBuildInfoJsonAtRoot(dir);
    attempts.push(attempt);
    if (attempt.outcome === "ok") {
      return { partial, usedPath: attempt.filePath, attempts };
    }
  }
  return { partial: {}, usedPath: null, attempts };
}

function logResolutionOnce(usedPath: string | null, attempts: ReadAttempt[]): void {
  if (resolutionLogged) return;
  if (process.env.DEPLOY_BUILD_INFO_LOG === "0") return;
  if (process.env.VITEST !== undefined || process.env.NODE_ENV === "test") return;
  resolutionLogged = true;

  const missing = attempts.filter(a => a.outcome === "missing").length;
  const invalid = attempts.filter(a => a.outcome === "invalid_json").length;
  const summary = attempts
    .slice(0, 8)
    .map(a => `${a.outcome === "missing" ? "missing" : a.outcome === "invalid_json" ? "bad_json" : "ok"}:${a.filePath}`)
    .join(" | ");
  const more = attempts.length > 8 ? ` (+${attempts.length - 8} more)` : "";
  console.info(
    `[deployBuildInfo] build-info.json source=${usedPath ?? "none"} missing=${missing} invalid_json=${invalid} detail=${summary}${more}`,
  );
}

function nearestPackageJsonRootForVersion(cwd: string, importMetaUrl: string): string | null {
  const fromCwd = findDirectoryContainingFile(cwd, "package.json");
  if (fromCwd) return fromCwd;
  const importDir = importMetaUrlToFileDir(importMetaUrl);
  if (!importDir) return null;
  return findDirectoryContainingFile(importDir, "package.json");
}

export type ResolveDeployBuildInfoOptions = {
  cwd?: string;
  importMetaUrl?: string;
  /** When set, skips one-time console.info resolution log (for tests). */
  silenceLog?: boolean;
};

/**
 * Resolves deploy-time build metadata from `build-info.json` using multiple candidate roots
 * (DEPLOY_ROOT, cwd, package.json parents). Safe if every file is missing or invalid.
 */
export function resolveDeployBuildInfo(opts?: ResolveDeployBuildInfoOptions): DeployBuildInfoPayload {
  const cwd = opts?.cwd ?? process.cwd();
  const importMetaUrl = opts?.importMetaUrl ?? import.meta.url;
  const deployRootEnv = process.env.DEPLOY_ROOT?.trim() || null;

  const candidateDirs = computeBuildInfoCandidateDirs({
    cwd,
    importMetaUrl,
    deployRootEnv,
  });

  const { partial: fromFile, usedPath, attempts } = readFirstOrderedBuildInfo(candidateDirs);

  if (!opts?.silenceLog) {
    logResolutionOnce(usedPath, attempts);
  }

  const pkgRoot = nearestPackageJsonRootForVersion(cwd, importMetaUrl);
  const pkgVersion = pkgRoot ? readPackageVersionInDir(pkgRoot) : readPackageVersionInDir(cwd);

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
