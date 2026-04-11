export function rootDomainOnly(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./i, "");
  const labels = d.split(".").filter(Boolean);
  if (labels.length <= 2) return d;
  const publicSuffix3Labels = ["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "org.au", "net.au", "co.jp"];
  const last3 = labels.slice(-3).join(".");
  if (publicSuffix3Labels.includes(last3)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

export function inferPatternFromPublicEmails(emails: string[], domain: string): "first.last" | "flast" | null {
  const root = rootDomainOnly(domain);
  const locals = emails
    .map(e => e.toLowerCase())
    .filter(e => e.endsWith(`@${root}`))
    .map(e => e.split("@")[0] ?? "")
    .filter(Boolean);
  if (locals.length === 0) return null;
  const dotCount = locals.filter(l => l.includes(".")).length;
  if (dotCount / locals.length >= 0.6) return "first.last";
  const shortCount = locals.filter(l => l.length <= 8).length;
  if (shortCount / locals.length >= 0.6) return "flast";
  return null;
}

export function splitName(fullName: string | null): { first: string | null; last: string | null } {
  const s = (fullName ?? "").trim();
  if (!s) return { first: null, last: null };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };
  return { first: parts[0] ?? null, last: parts[parts.length - 1] ?? null };
}

function isValidEmailLocalPart(local: string): boolean {
  if (!local) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  return /^[a-z0-9._%+-]{2,64}$/.test(local);
}

export function guessEmailsFromName(input: {
  first: string | null;
  last: string | null;
  domain: string;
  patternHint: "first.last" | "flast" | null;
}): Array<{ email: string; confidence: number; reason: string }> {
  const root = rootDomainOnly(input.domain);
  const f = (input.first ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const l = (input.last ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!f && !l) return [];

  const out: Array<{ email: string; confidence: number; reason: string }> = [];
  const push = (local: string, confidence: number, reason: string) => {
    if (!isValidEmailLocalPart(local)) return;
    out.push({ email: `${local}@${root}`, confidence, reason });
  };

  if (input.patternHint === "first.last") push(`${f}.${l}`, 0.74, "pattern_inferred:first.last");
  if (input.patternHint === "flast") push(`${f.slice(0, 1)}${l}`, 0.72, "pattern_inferred:flast");

  push(`${f}.${l}`, 0.60, "common:first.last");
  push(`${f}${l}`, 0.56, "common:firstlast");
  push(`${f.slice(0, 1)}${l}`, 0.54, "common:flast");
  push(`${f}${l.slice(0, 1)}`, 0.52, "common:firstl");
  push(`${f}`, 0.45, "common:first");

  const dedup = new Map<string, { email: string; confidence: number; reason: string }>();
  for (const e of out) {
    const prev = dedup.get(e.email);
    if (!prev || e.confidence > prev.confidence) dedup.set(e.email, e);
  }
  return Array.from(dedup.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

export function matchesSignalNeedles(input: {
  haystack: string;
  industryNeedle: string;
  countryNeedle: string;
}): boolean {
  const hay = input.haystack.toLowerCase();
  if (input.industryNeedle && !hay.includes(input.industryNeedle)) return false;
  if (input.countryNeedle && !hay.includes(input.countryNeedle)) return false;
  return true;
}
