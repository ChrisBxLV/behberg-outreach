// Names that should never be classified as a company. We still keep them in
// the DB with `status="excluded_self_employed"` to dedupe future ingests, but
// they are hidden from search results.

const EXCLUDED_NAME_PATTERNS = [
  /^self[\s-]?employed$/i,
  /^freelance(?:r|ing)?$/i,
  /^independent(?:\s+(?:consultant|contractor|professional))?$/i,
  /^stealth(?:\s+(?:mode|startup|company))?$/i,
  /^under\s+nda$/i,
  /^confidential$/i,
  /^private(?:\s+(?:client|company))?$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^retired$/i,
  /^unemployed$/i,
  /^student$/i,
  /^looking\s+for\s+(?:work|opportunities)$/i,
  /^open\s+to\s+work$/i,
  /^various$/i,
  /^multiple\s+(?:companies|employers)$/i,
];

const EXCLUDED_DOMAIN_PATTERNS = [
  /^linkedin\.com$/i,
  /^(?:gmail|googlemail|yahoo|yahoomail|hotmail|outlook|live|msn|aol|icloud|me|mac|protonmail|proton|gmx|mail)\.\w+$/i,
];

export function isExcludedCompanyName(name: string): boolean {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return true;
  return EXCLUDED_NAME_PATTERNS.some(re => re.test(cleaned));
}

export function isExcludedDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.trim().toLowerCase();
  return EXCLUDED_DOMAIN_PATTERNS.some(re => re.test(d));
}

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    // Avoid Unicode property escapes so server build can target ES5.
    .replace(/[^a-z0-9\s&]/gi, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|s\.a\.|sa|ab|ag|bv|oy|plc)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
