/**
 * Pure composer for the app's build metadata.
 *
 * Kept side-effect free (no fs, no child_process) so it can be unit-tested
 * and re-used by both the build-time generator script and any future runtime
 * fallback path. The actual git/file IO lives in
 * `scripts/generate-build-info.mjs`, which feeds inputs into this function.
 */

export type BuildInfo = {
  /** App version string, e.g. `v0.1.123`. Always non-empty. */
  version: string;
  /** Short git SHA, or `null` when git was unavailable. */
  commit: string | null;
  /** ISO timestamp of when the build metadata was generated, or `null`. */
  buildTime: string | null;
  /** Total commit count on HEAD, used as the build number; `null` when unavailable. */
  commitCount: number | null;
};

export type ComposeBuildInfoInput = {
  /** `package.json#version`, e.g. `"0.1.0"`. Used for the `vMAJOR.MINOR` prefix. */
  packageVersion: string | null | undefined;
  /** `git rev-list --count HEAD`, parsed to number. `null` when unknown. */
  commitCount: number | null;
  /** `git rev-parse --short HEAD`. `null` when unknown. */
  commitSha: string | null;
  /** `new Date()` at build time. `null` for "unknown". */
  now: Date | null;
};

const FALLBACK_PREFIX = "v0.0";

function deriveVersionPrefix(packageVersion: string | null | undefined): string {
  const m = /^(\d+)\.(\d+)/.exec(String(packageVersion ?? ""));
  if (!m) return FALLBACK_PREFIX;
  return `v${m[1]}.${m[2]}`;
}

/**
 * Build a `BuildInfo` value from raw inputs.
 *
 * - `version` always begins with `vMAJOR.MINOR` derived from `package.json`.
 *   When the commit count is known we append it (`v0.1.123`); otherwise we
 *   suffix `.0-dev` so it is still a valid, parseable string.
 * - Other fields pass through with conservative null-handling.
 */
export function composeBuildInfo(input: ComposeBuildInfoInput): BuildInfo {
  const prefix = deriveVersionPrefix(input.packageVersion);
  const count =
    typeof input.commitCount === "number" &&
    Number.isFinite(input.commitCount) &&
    input.commitCount >= 0
      ? Math.trunc(input.commitCount)
      : null;
  const version = count != null ? `${prefix}.${count}` : `${prefix}.0-dev`;
  const commit =
    typeof input.commitSha === "string" && input.commitSha.trim().length > 0
      ? input.commitSha.trim()
      : null;
  const buildTime = input.now instanceof Date ? input.now.toISOString() : null;
  return { version, commit, buildTime, commitCount: count };
}
