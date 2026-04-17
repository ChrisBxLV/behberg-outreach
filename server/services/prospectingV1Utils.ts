export function rootDomainOnly(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./i, "");
  const labels = d.split(".").filter(Boolean);
  if (labels.length <= 2) return d;
  const publicSuffix2Labels = ["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "org.au", "net.au", "co.jp"];
  const last2 = labels.slice(-2).join(".");
  if (publicSuffix2Labels.includes(last2)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

const COMPANY_STOP_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "group",
  "holding",
  "holdings",
  "company",
  "co",
  "plc",
  "ab",
  "ag",
  "sa",
  "bv",
  "oy",
]);

export function companyFragments(company: string): string[] {
  const parts = company
    .toLowerCase()
    .split(/\s+/g)
    .map(p => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .filter(p => p.length >= 3 && !COMPANY_STOP_WORDS.has(p));
  return Array.from(new Set(parts)).slice(0, 5);
}

export function domainContainsCompany(domain: string, company: string): boolean {
  const d = domain.toLowerCase();
  const frags = companyFragments(company);
  if (frags.length === 0) return false;
  return frags.some(f => d.includes(f));
}

export function generateDomainCandidates(company: string): string[] {
  const frags = companyFragments(company);
  if (frags.length === 0) return [];
  const compact = frags.join("");
  const dashed = frags.join("-");
  const first = frags[0] ?? compact;
  const roots = Array.from(new Set([compact, dashed, first].filter(Boolean)));
  const tlds = ["com", "io", "co", "ai", "net", "org"];
  const out: string[] = [];
  for (const root of roots) {
    for (const tld of tlds) out.push(`${root}.${tld}`);
  }
  return Array.from(new Set(out)).slice(0, 18);
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

type TitleFamily = {
  key: string;
  variants: string[];
};

const TITLE_FAMILIES: TitleFamily[] = [
  {
    key: "chief_executive",
    variants: ["ceo", "chief executive officer", "president", "managing director", "md", "founder", "co founder", "owner"],
  },
  {
    key: "chief_operating",
    variants: ["coo", "chief operating officer", "head of operations", "vp operations", "director of operations"],
  },
  {
    key: "chief_financial",
    variants: ["cfo", "chief financial officer", "finance director", "vp finance", "head of finance"],
  },
  {
    key: "chief_technology",
    variants: ["cto", "chief technology officer", "vp engineering", "head of engineering", "engineering director"],
  },
  {
    key: "chief_information",
    variants: ["cio", "chief information officer", "it director", "head of it", "vp it"],
  },
  {
    key: "chief_security",
    variants: ["ciso", "chief information security officer", "head of security", "security director"],
  },
  {
    key: "chief_marketing",
    variants: ["cmo", "chief marketing officer", "vp marketing", "head of marketing", "marketing director"],
  },
  {
    key: "chief_revenue",
    variants: ["cro", "chief revenue officer", "chief commercial officer", "cco", "vp sales", "head of sales", "sales director", "director of sales"],
  },
  {
    key: "chief_people",
    variants: ["chro", "chief human resources officer", "head of people", "hr director", "vp people"],
  },
  {
    key: "chief_product",
    variants: ["cpo", "chief product officer", "vp product", "head of product", "product director", "director of product"],
  },
  {
    key: "general_management",
    variants: ["general manager", "gm", "country manager", "regional director", "managing partner"],
  },
];

function normalizeTitleValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTitleForLookup(value: string): string {
  return normalizeTitleValue(value)
    .replace(/\bvice president\b/g, "vp")
    .replace(/\bco founder\b/g, "cofounder")
    .trim();
}

function expandVariantForms(variant: string): string[] {
  const base = normalizeTitleValue(variant);
  const out = new Set<string>([base]);
  if (base.includes("vice president")) out.add(base.replace(/\bvice president\b/g, "vp"));
  if (base.includes("vp ")) out.add(base.replace(/\bvp\b/g, "vice president"));
  if (base.includes("co founder")) out.add(base.replace(/\bco founder\b/g, "cofounder"));
  if (base.includes("cofounder")) out.add(base.replace(/\bcofounder\b/g, "co founder"));
  return Array.from(out);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function acronymPattern(value: string): string {
  const letters = value.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length < 2 || letters.length > 6) return escapeRegExp(value);
  return letters.split("").map(ch => `${ch}\\.?`).join("");
}

function titleVariantToPattern(variant: string): string {
  if (/^[a-z]{2,6}$/.test(variant)) return acronymPattern(variant);
  return escapeRegExp(variant).replace(/\\\s+/g, "\\s+");
}

export function getTitleSynonyms(titleNeedle: string): string[] {
  const normalized = normalizeTitleValue(titleNeedle);
  const lookup = normalizeTitleForLookup(titleNeedle);
  if (!normalized) return [];
  for (const family of TITLE_FAMILIES) {
    const expandedFamilyVariants = family.variants.flatMap(expandVariantForms);
    const familyLookupSet = new Set(expandedFamilyVariants.map(normalizeTitleForLookup));
    if (familyLookupSet.has(lookup)) {
      return Array.from(new Set([normalized, ...expandedFamilyVariants]));
    }
  }
  return [normalized];
}

export function titleSynonymsForNeedle(titleNeedle: string): string[] {
  return getTitleSynonyms(titleNeedle);
}

export function titleSynonymsForInput(titleNeedle: string): string[] {
  return getTitleSynonyms(titleNeedle);
}

export function titleMatchesLine(line: string, titleNeedle: string): boolean {
  const normalizedLine = normalizeTitleValue(line);
  const synonyms = getTitleSynonyms(titleNeedle);
  for (const synonym of synonyms) {
    const re = new RegExp(`\\b${titleVariantToPattern(synonym)}\\b`, "i");
    if (re.test(normalizedLine) || re.test(line)) return true;
  }
  return false;
}
