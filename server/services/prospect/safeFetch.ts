// Lightweight safe HTTP fetch shared across seed adapters and the website
// crawler. Wraps the existing safety primitives from website.provider via a
// thin re-implementation that does not require building EnrichmentField rows.
//
// Optional networking (Prospect DB crawler only — this module is not used by
// mail/OAuth/SMTP):
//   PROSPECT_CRAWLER_OUTBOUND_IP   — bind outbound TCP to this local IPv4
//   PROSPECT_CRAWLER_FORCE_IPV4    — IPv4-only DNS + outbound sockets

import dns from "node:dns/promises";
import net from "node:net";
import { Agent, buildConnector, fetch as undiciFetch, type Dispatcher } from "undici";
import { isBlockedCompanyWebsiteHost } from "../../enrichment/hostBlocklist";
import { bumpHostThrottle, hostFromUrl, isHostAllowed } from "./throttle";
import { getProspectCrawlerRuntimeSettings } from "./crawlerSettings";

const DEFAULT_USER_AGENT = "krot.io-prospect-crawler/1.0 (+https://crawler.krot.io)";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_500_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function crawlerUserAgent(): string {
  const ua = process.env.PROSPECT_CRAWLER_USER_AGENT?.trim();
  return ua && ua.length > 0 ? ua : DEFAULT_USER_AGENT;
}

function prospectCrawlerForceIpv4(): boolean {
  const v = process.env.PROSPECT_CRAWLER_FORCE_IPV4?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Parsed outbound bind address, or null if unset / invalid. */
export function prospectCrawlerOutboundIpv4(): string | null {
  const raw = process.env.PROSPECT_CRAWLER_OUTBOUND_IP?.trim();
  if (!raw) return null;
  if (net.isIP(raw) !== 4) {
    console.warn(`[safeFetch] PROSPECT_CRAWLER_OUTBOUND_IP ignored (not IPv4): ${raw}`);
    return null;
  }
  return raw;
}

/** Lazy singleton undici Agent for crawler-only outbound customization. */
let prospectCrawlerDispatcher: Dispatcher | false | undefined;

function getProspectCrawlerDispatcher(): Dispatcher | undefined {
  if (prospectCrawlerDispatcher !== undefined) {
    return prospectCrawlerDispatcher === false ? undefined : prospectCrawlerDispatcher;
  }
  const outbound = prospectCrawlerOutboundIpv4();
  const forceIpv4 = prospectCrawlerForceIpv4();
  if (!outbound && !forceIpv4) {
    prospectCrawlerDispatcher = false;
    return undefined;
  }
  // Use undici's buildConnector() so options flow into tls.connect/net.connect
  // (see undici/lib/core/connect.js: ...options spread). Passing only a plain
  // object to Agent({ connect }) is easy to misread; a built connector is explicit.
  // family + autoSelectFamily keep outbound attempts on IPv4 and avoid dual-stack reordering.
  // undici's BuildOptions typing intersects TcpNetConnectOpts in a way that can
  // incorrectly require `port` here; runtime options match tls.connect/net.connect.
  const connector = buildConnector({
    ...(outbound ? { localAddress: outbound } : {}),
    family: 4,
    autoSelectFamily: false,
  } as Parameters<typeof buildConnector>[0]);
  prospectCrawlerDispatcher = new Agent({ connect: connector });
  return prospectCrawlerDispatcher;
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
  const literalIpKind = net.isIP(hostname);
  if (literalIpKind) {
    if (isBlockedIp(hostname)) throw new Error("Blocked IP");
    if (prospectCrawlerForceIpv4() && literalIpKind === 6) {
      throw new Error("IPv6 host not allowed when PROSPECT_CRAWLER_FORCE_IPV4=true");
    }
    return;
  }
  const lookups = prospectCrawlerForceIpv4()
    ? await dns.lookup(hostname, { all: true, family: 4 })
    : await dns.lookup(hostname, { all: true, verbatim: true });
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
  /** Skip robots.txt gate (e.g. when fetching robots.txt itself). */
  skipRobotsTxt?: boolean;
};

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  body: string;
  contentType: string;
};

/**
 * Fetches an HTTP(S) URL with private-IP guards, redirect validation, byte
 * caps, timeouts, per-host throttle, and a transparent crawler User-Agent.
 * Returns null when the host is throttled or blocked rather than throwing.
 *
 * When `PROSPECT_CRAWLER_OUTBOUND_IP` and/or `PROSPECT_CRAWLER_FORCE_IPV4` are
 * set, uses undici with a dedicated Agent (local bind + IPv4-only outbound).
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult | null> {
  const rt = await getProspectCrawlerRuntimeSettings();
  const timeoutMs = opts.timeoutMs ?? rt.fetchTimeoutMs ?? envInt("PROSPECT_FETCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const maxBytes = opts.maxBytes ?? rt.fetchMaxBytes ?? envInt("PROSPECT_FETCH_MAX_BYTES", DEFAULT_MAX_BYTES);
  const userAgent = crawlerUserAgent();
  const dispatcher = getProspectCrawlerDispatcher();

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return null;
  }

  async function gate(url: URL): Promise<boolean> {
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (isBlockedCompanyWebsiteHost(url.hostname)) return false;
    const h = hostFromUrl(url.toString());
    if (!opts.skipThrottle && h) {
      if (!(await isHostAllowed(h))) return false;
    }
    if (!opts.skipRobotsTxt && rt.respectRobotsTxt) {
      const { isCrawlAllowedByRobotsTxt } = await import("./robotsTxt");
      if (!(await isCrawlAllowedByRobotsTxt(url.hostname, url.pathname || "/"))) return false;
    }
    try {
      await assertPublicResolvableHost(url);
    } catch {
      return false;
    }
    return true;
  }

  if (!(await gate(current))) return null;

  for (let i = 0; i < 5; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const activeHost = hostFromUrl(current.toString());
    try {
      const res = await undiciFetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ac.signal,
        ...(dispatcher ? { dispatcher } : {}),
        headers: {
          "User-Agent": userAgent,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, current.toString());
        if (!(await gate(next))) return null;
        current = next;
        continue;
      }

      const status = res.status;
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!res.ok) {
        if (status === 429 || status >= 500) {
          if (activeHost && !opts.skipThrottle) await bumpHostThrottle(activeHost, { error: true });
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
      if (activeHost && !opts.skipThrottle) await bumpHostThrottle(activeHost, { error: false });
      return { finalUrl: current.toString(), status, body, contentType: ct };
    } catch (err: any) {
      if (activeHost && !opts.skipThrottle) await bumpHostThrottle(activeHost, { error: true });
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

const IPIFY_URL = "https://api.ipify.org?format=json";

export type DiagnoseProspectCrawlerOutboundIpResult = {
  ok: boolean;
  /** Remote-visible IPv4 from ipify, when successful */
  remoteIp?: string;
  error?: string;
  outboundBindIp: string | null;
  forceIpv4: boolean;
};

/**
 * One-shot diagnostic: performs a minimal safeFetch to api.ipify.org and
 * prints the IP the remote sees (should match your floating IP when bind is
 * configured). Does not run the full crawler.
 */
export async function diagnoseProspectCrawlerOutboundIp(): Promise<DiagnoseProspectCrawlerOutboundIpResult> {
  const outboundBindIp = prospectCrawlerOutboundIpv4();
  const forceIpv4 = prospectCrawlerForceIpv4();
  const res = await safeFetch(IPIFY_URL, {
    timeoutMs: 12_000,
    maxBytes: 4096,
    skipThrottle: true,
    skipRobotsTxt: true,
  });
  if (!res) {
    return {
      ok: false,
      error: "safeFetch returned null (blocked, throttled, timeout, or network error)",
      outboundBindIp,
      forceIpv4,
    };
  }
  try {
    const parsed = JSON.parse(res.body) as { ip?: string };
    const remoteIp = typeof parsed.ip === "string" ? parsed.ip : undefined;
    if (!remoteIp) {
      return { ok: false, error: "Unexpected ipify response body", outboundBindIp, forceIpv4 };
    }
    return { ok: true, remoteIp, outboundBindIp, forceIpv4 };
  } catch {
    return { ok: false, error: "Failed to parse ipify JSON", outboundBindIp, forceIpv4 };
  }
}
