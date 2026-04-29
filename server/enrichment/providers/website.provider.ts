import dns from "node:dns/promises";
import net from "node:net";
import type { EnrichmentField, EnrichmentInput, EnrichmentProvider } from "../enrichment.types";
import { isBlockedCompanyWebsiteHost } from "../hostBlocklist";

type WebsiteFetchResult = {
  finalUrl: string;
  html: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  social: {
    linkedinCompanyUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    twitterOrXUrl: string | null;
    youtubeUrl: string | null;
  };
  visibleEmails: string[];
  visiblePhones: string[];
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_HTML_BYTES = 1_000_000;

function envInt(name: string, fallback: number) {
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
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  const v6 = net.isIP(ip) === 6;
  if (v6) {
    const lower = ip.toLowerCase();
    // Block IPv4-mapped IPv6 addresses by evaluating the embedded IPv4.
    // Example: ::ffff:127.0.0.1 or ::FFFF:169.254.169.254
    if (lower.startsWith("::ffff:")) {
      const tail = lower.slice("::ffff:".length);
      // Common form: dotted-quad
      if (tail.includes(".")) {
        return isBlockedIp(tail);
      }
      // Hex form (e.g. ::ffff:7f00:1). Be conservative and block.
      return true;
    }
    if (lower === "::") return true;
    if (lower === "::1") return true; // IPv6 loopback (e.g. http://[::1]/)
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
    return false;
  }

  return true;
}

async function assertPublicResolvableHost(url: URL): Promise<void> {
  const hostname = url.hostname;
  if (isBlockedHostname(hostname)) throw new Error("Blocked hostname");

  // Block IP literals and private networks.
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

function isLinkedInHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "linkedin.com" || h.endsWith(".linkedin.com");
}

function isLinkedInUrl(u: URL): boolean {
  return isLinkedInHost(u.hostname);
}

function isHttpUrl(u: URL): boolean {
  return u.protocol === "http:" || u.protocol === "https:";
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,512}?)<\/title>/i);
  if (!m?.[1]) return null;
  return sanitizeText(m[1].replace(/<[^>]*>/g, " "));
}

function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{0,512})["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']{0,512})["'][^>]*name=["']description["'][^>]*>/i);
  if (!m?.[1]) return null;
  return sanitizeText(m[1]);
}

function extractCanonicalUrl(html: string, baseUrl: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']{1,1024})["'][^>]*>/i) ??
    html.match(/<link[^>]+href=["']([^"']{1,1024})["'][^>]*rel=["']canonical["'][^>]*>/i);
  const href = m?.[1]?.trim();
  if (!href) return null;
  try {
    const u = new URL(href, baseUrl);
    if (!isHttpUrl(u)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']{1,2048})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1]?.trim();
    if (!href) continue;
    out.push(href);
    if (out.length > 2000) break;
  }
  return out;
}

function pickFirstUrlByHost(hrefsAbs: string[], hostMatchers: Array<(host: string) => boolean>): string | null {
  for (const h of hrefsAbs) {
    try {
      const u = new URL(h);
      const host = u.hostname.toLowerCase();
      if (hostMatchers.some(fn => fn(host))) {
        u.hash = "";
        return u.toString();
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function extractVisibleEmails(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const e = m[0].toLowerCase();
    if (e.length > 320) continue;
    found.add(e);
    if (found.size >= 20) break;
  }
  return Array.from(found);
}

function extractVisiblePhones(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const re = /(\+?\d[\d\s().-]{7,}\d)/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = sanitizeText(m[1] ?? "");
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.length < 8 || digits.length > 20) continue;
    found.add(raw);
    if (found.size >= 20) break;
  }
  return Array.from(found);
}

async function fetchHtmlWithRedirectValidation(startUrl: string): Promise<{ finalUrl: string; html: string }> {
  const timeoutMs = envInt("ENRICHMENT_FETCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const maxBytes = envInt("ENRICHMENT_MAX_HTML_BYTES", DEFAULT_MAX_HTML_BYTES);

  let current = new URL(startUrl);
  if (!isHttpUrl(current)) throw new Error("Only http/https URLs allowed");
  if (isLinkedInUrl(current)) throw new Error("LinkedIn fetch is not allowed");
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
          "User-Agent": "krot.io-enrichment/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, current.toString());
        if (!isHttpUrl(next)) throw new Error("Redirected to non-http(s) URL");
        if (isLinkedInUrl(next)) throw new Error("Redirected to LinkedIn (blocked)");
        if (isBlockedCompanyWebsiteHost(next.hostname)) {
          throw new Error("Redirected to a social or login page (not used as company site)");
        }
        await assertPublicResolvableHost(next);
        current = next;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Website fetch failed: HTTP ${res.status}`);
      }

      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) {
        // Still allow some servers that omit content-type, but block obvious non-html.
        if (ct.includes("application/json") || ct.includes("image/") || ct.includes("application/pdf")) {
          throw new Error("Non-HTML response");
        }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      let truncated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const nextTotal = total + value.byteLength;
        if (nextTotal > maxBytes) {
          // Don't fail enrichment on large pages; keep the first bytes and parse what we can.
          const remaining = Math.max(0, maxBytes - total);
          if (remaining > 0) {
            chunks.push(value.slice(0, remaining));
            total += remaining;
          }
          truncated = true;
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
      const html = buf.toString("utf8") + (truncated ? "\n<!-- truncated -->\n" : "");
      return { finalUrl: current.toString(), html };
    } finally {
      clearTimeout(t);
    }
  }

  throw new Error("Too many redirects");
}

export class WebsiteProvider implements EnrichmentProvider {
  name = "website";

  async enrich(input: EnrichmentInput): Promise<EnrichmentField[]> {
    const rawUrl = (input.companyWebsite ?? "").trim();
    const possibleWebsiteUrl = rawUrl.length ? rawUrl : null;
    if (!possibleWebsiteUrl) return [];

    const start = (() => {
      try {
        const withProto = /^https?:\/\//i.test(possibleWebsiteUrl)
          ? possibleWebsiteUrl
          : `https://${possibleWebsiteUrl}`;
        return new URL(withProto);
      } catch {
        return null;
      }
    })();
    if (!start) return [];
    if (!isHttpUrl(start)) return [];
    if (isLinkedInUrl(start)) return [];
    if (isBlockedCompanyWebsiteHost(start.hostname)) return [];

    const { finalUrl, html } = await fetchHtmlWithRedirectValidation(start.toString());

    const title = extractTitle(html);
    const metaDescription = extractMetaDescription(html);
    const canonicalUrl = extractCanonicalUrl(html, finalUrl);

    const hrefs = extractHrefs(html);
    const hrefsAbs = hrefs
      .map(h => {
        try {
          return new URL(h, finalUrl).toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    const social = {
      linkedinCompanyUrl: pickFirstUrlByHost(hrefsAbs, [h => isLinkedInHost(h)]),
      facebookUrl: pickFirstUrlByHost(hrefsAbs, [h => h === "facebook.com" || h.endsWith(".facebook.com")]),
      instagramUrl: pickFirstUrlByHost(hrefsAbs, [h => h === "instagram.com" || h.endsWith(".instagram.com")]),
      twitterOrXUrl: pickFirstUrlByHost(hrefsAbs, [
        h => h === "twitter.com" || h.endsWith(".twitter.com") || h === "x.com" || h.endsWith(".x.com"),
      ]),
      youtubeUrl: pickFirstUrlByHost(hrefsAbs, [
        h => h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be",
      ]),
    };

    const visibleEmails = extractVisibleEmails(html);
    const visiblePhones = extractVisiblePhones(html);

    const result: WebsiteFetchResult = {
      finalUrl,
      html,
      title,
      metaDescription,
      canonicalUrl,
      social,
      visibleEmails,
      visiblePhones,
    };

    const fields: EnrichmentField[] = [];
    if (title) {
      fields.push({
        source: "website",
        fieldName: "pageTitle",
        fieldValue: title,
        confidence: 70,
        personalData: false,
      });
    }
    if (metaDescription) {
      fields.push({
        source: "website",
        fieldName: "metaDescription",
        fieldValue: metaDescription,
        confidence: 70,
        personalData: false,
      });
    }
    if (canonicalUrl) {
      fields.push({
        source: "website",
        fieldName: "canonicalUrl",
        fieldValue: canonicalUrl,
        confidence: 75,
        personalData: false,
      });
    }

    const socialMap: Array<[keyof WebsiteFetchResult["social"], string]> = [
      ["linkedinCompanyUrl", "linkedinCompanyUrl"],
      ["facebookUrl", "facebookUrl"],
      ["instagramUrl", "instagramUrl"],
      ["twitterOrXUrl", "twitterOrXUrl"],
      ["youtubeUrl", "youtubeUrl"],
    ];
    for (const [key, fieldName] of socialMap) {
      const v = result.social[key];
      if (!v) continue;
      if (v.includes("linkedin.com")) {
        // Found on company site, but still treat as manual reference only (do not fetch).
        fields.push({
          source: "website",
          fieldName,
          fieldValue: v,
          confidence: 60,
          personalData: false,
          rawData: { note: "Found on public website; not fetched." },
        });
      } else {
        fields.push({
          source: "website",
          fieldName,
          fieldValue: v,
          confidence: 60,
          personalData: false,
        });
      }
    }

    for (const e of visibleEmails) {
      fields.push({
        source: "website",
        fieldName: "visibleEmail",
        fieldValue: e,
        confidence: 55,
        personalData: true,
      });
    }
    for (const p of visiblePhones) {
      fields.push({
        source: "website",
        fieldName: "visiblePhone",
        fieldValue: p,
        confidence: 55,
        personalData: true,
      });
    }

    // Provide raw HTML snippet for downstream tech detection (no PII filtering here; stored in rawData is optional)
    fields.push({
      source: "website",
      fieldName: "websiteFetch",
      fieldValue: finalUrl,
      confidence: 80,
      personalData: false,
      rawData: {
        finalUrl,
        title,
        metaDescription,
        canonicalUrl,
        social,
        visibleEmailsCount: visibleEmails.length,
        visiblePhonesCount: visiblePhones.length,
        html,
      },
    });

    return fields;
  }
}

export function extractWebsiteHtmlRawData(fields: EnrichmentField[]): string | null {
  const f = fields.find(x => x.source === "website" && x.fieldName === "websiteFetch");
  const raw = f?.rawData as any;
  const html = raw?.html;
  return typeof html === "string" ? html : null;
}

