/**
 * Minimal robots.txt handling for the prospect crawler.
 * Not a full RFC9309 implementation — merges all `Disallow` paths from every
 * record whose `User-agent` list includes `*`, including multiple `*` groups.
 */

/** Cached robots.txt body per host — pathname is applied on read (not part of the key). */
const cache = new Map<string, { expiresAt: number; body: string }>();
const TTL_MS = 15 * 60_000;

function stripComments(line: string): string {
  const i = line.indexOf("#");
  return (i >= 0 ? line.slice(0, i) : line).trim();
}

/**
 * RFC 9309-style prefix match: `Disallow: /admin` matches `/admin` and
 * `/admin/...` but not `/admin2` or `/administration` (boundary after prefix).
 * `Disallow: /` still blocks the whole site for paths under `/`.
 */
function pathMatchesDisallowPrefix(path: string, rule: string): boolean {
  const prefix = rule.startsWith("/") ? rule : `/${rule}`;
  if (prefix === "/") return path.startsWith("/");
  if (!path.startsWith(prefix)) return false;
  return path.length === prefix.length || path.charAt(prefix.length) === "/";
}

/**
 * Returns false when any `User-agent` group that includes `*` disallows the
 * request path (prefix + path-boundary match on disallow paths). Multiple
 * `User-agent: *` blocks and multi-agent groups (`User-agent: *` then other
 * agents in the same record) are merged per RFC 9309-style grouping. Unknown /
 * parse errors → allow (fail open).
 */
export function evaluateRobotsTxtAgainstPath(robotsBody: string, requestPath: string): boolean {
  const path = requestPath && requestPath.startsWith("/") ? requestPath : `/${requestPath || ""}`;
  const lines = robotsBody.split(/\r?\n/);
  const disallows: string[] = [];
  /** User-agents for the current record (until blank line or new group after directives). */
  let groupAgents: string[] = [];
  let sawDirectiveInGroup = false;

  for (const raw of lines) {
    const line = stripComments(raw);
    if (!line) {
      groupAgents = [];
      sawDirectiveInGroup = false;
      continue;
    }
    const mUa = /^user-agent:\s*(.+)$/i.exec(line);
    if (mUa) {
      const ua = mUa[1]!.trim().toLowerCase();
      if (sawDirectiveInGroup) {
        groupAgents = [ua];
        sawDirectiveInGroup = false;
      } else {
        groupAgents.push(ua);
      }
      continue;
    }
    sawDirectiveInGroup = true;
    const mDis = /^disallow:\s*(.*)$/i.exec(line);
    if (!mDis || !groupAgents.includes("*")) continue;
    const p = mDis[1]!.trim();
    if (p) disallows.push(p);
  }
  for (const rule of disallows) {
    if (pathMatchesDisallowPrefix(path, rule)) return false;
  }
  return true;
}

export async function isCrawlAllowedByRobotsTxt(hostname: string, pathname: string): Promise<boolean> {
  const key = hostname.toLowerCase();
  const path = pathname || "/";
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return evaluateRobotsTxtAgainstPath(hit.body, path);
  }

  const robotsUrl = `https://${key}/robots.txt`;
  const { safeFetch } = await import("./safeFetch");
  const res = await safeFetch(robotsUrl, {
    skipRobotsTxt: true,
    skipThrottle: true,
    accept: "text/plain,*/*",
  });
  const body = res && res.status === 200 && res.body ? res.body : "";
  cache.set(key, { expiresAt: now + TTL_MS, body });
  return evaluateRobotsTxtAgainstPath(body, path);
}
