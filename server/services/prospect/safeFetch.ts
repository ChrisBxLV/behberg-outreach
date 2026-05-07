// Lightweight safe HTTP fetch shared across seed adapters and the website
// crawler. Wraps the existing safety primitives from website.provider via a
// thin re-implementation that does not require building EnrichmentField rows.

import dns from "node:dns/promises";
import net from "node:net";
import { isBlockedCompanyWebsiteHost } from "../../enrichment/hostBlocklist";
import { bumpHostThrottle, hostFromUrl, isHostAllowed } from "./throttle";

const USER_AGENTS = [
  "krot.io-prospect-crawler/1.0 (+https://krot.io)",
  "Mozilla/5.0 (compatible; krot-prospect/1.0; +https://krot.io)",
];

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_500_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

function isBlockedIp(ip: string): boolean {
  if (ip === "::1") return true;
  const v4 = net.isIP(ip) === 4;
  if (v4) {
    const parts = ip.split(".").map(p => Number(p));
    if (parts.length !== 4 || parts.some(p => !Number.isFinite(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  const v6 = net.isIP(ip) === 6;
  if (v6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) {
      const tail = lower.slice("::ffff:".length);
      if (tail.includes(".")) return isBlockedIp(tail);
      return true;
    }
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    return false;
  }
  return true;
}

async function assertPublicResolvableHost(url: URL): Promise<void> {
  const hostname = url.hostname;
  if (isBlockedHostname(hostname)) throw new Error("Blocked hostname");
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("Blocked IP");
    return;
  }
  const lookups = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!lookups.length) throw new Error("DNS lookup failed");
  for (const a of lookups) {
    if (isBlockedIp(a.address)) throw new Error("Blocked resolved IP");
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  /** Skip per-host throttle bookkeeping (e.g. for SPARQL endpoints). */
  skipThrottle?: boolean;
};

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  body: string;
  contentType: string;
};

/**
 * Fetches an HTTP(S) URL with private-IP guards, redirect validation, byte
 * caps, timeouts, per-host throttle, and User-Agent rotation. Returns null
 * when the host is throttled or blocked rather than throwing.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult | null> {
  const timeoutMs = opts.timeoutMs ?? envInt("PROSPECT_FETCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const maxBytes = opts.maxBytes ?? envInt("PROSPECT_FETCH_MAX_BYTES", DEFAULT_MAX_BYTES);

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return null;
  }
  if (current.protocol !== "http:" && current.protocol !== "https:") return null;
  if (isBlockedCompanyWebsiteHost(current.hostname)) return null;

  const host = hostFromUrl(current.toString());
  if (!opts.skipThrottle && host) {
    const allowed = await isHostAllowed(host);
    if (!allowed) return null;
  }

  await assertPublicResolvableHost(current);

  for (let i = 0; i < 5; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ac.signal,
        headers: {
          "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, current.toString());
        if (next.protocol !== "http:" && next.protocol !== "https:") return null;
        if (isBlockedCompanyWebsiteHost(next.hostname)) return null;
        await assertPublicResolvableHost(next);
        current = next;
        continue;
      }

      const status = res.status;
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!res.ok) {
        if (status === 429 || status >= 500) {
          if (host && !opts.skipThrottle) await bumpHostThrottle(host, { error: true });
        }
        return null;
      }

      const reader = res.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const nextTotal = total + value.byteLength;
        if (nextTotal > maxBytes) {
          const remaining = Math.max(0, maxBytes - total);
          if (remaining > 0) chunks.push(value.slice(0, remaining));
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }
        total = nextTotal;
        chunks.push(value);
      }
      const buf = Buffer.concat(chunks.map(u => Buffer.from(u)));
      const body = buf.toString("utf8");
      if (host && !opts.skipThrottle) await bumpHostThrottle(host, { error: false });
      return { finalUrl: current.toString(), status, body, contentType: ct };
    } catch (err: any) {
      if (host && !opts.skipThrottle) await bumpHostThrottle(host, { error: true });
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}
