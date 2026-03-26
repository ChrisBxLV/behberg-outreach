import { createHash } from "node:crypto";
import {
  completeSignalIngestionRun,
  createSignalIngestionRun,
  getEnabledSignalProfiles,
  getSignalProfile,
  listSignals,
  listSignalsForDedupe,
  upsertSignalInsight,
  upsertSignalItem,
  deleteSignalAndInsight,
} from "../db";
import { SIGNAL_TYPES } from "./signalsCatalog";
import { buildTagSpecificSources, getSourcesForProfile, type SignalSource } from "./signalsSources";
import { resolveCompanyDomainDeterministic } from "./companyDomainResolver";

type FeedItem = {
  source: string;
  title: string;
  description: string;
  article_html: string;
  link: string;
  publishedAt: Date;
  companyName: string;
  signalType: (typeof SIGNAL_TYPES)[number];
  tags: string[];
  seedTags: string[];
};

type CoarseSignalType = "funding" | "hiring" | "product" | "acquisition";

type ExtractedSignalData = {
  company: string | null;
  signal_type: CoarseSignalType;
  text: string;
  summary: string;
  date: string | null;
  amount: string | null;
  currency: string | null;
  round: string | null;
  person: string | null;
  role: string | null;
  product_name: string | null;
  domain: string | null;
  website_url: string | null;
  domain_confidence: number | null;
  company_aliases: string[] | null;
  evidence: string;
  confidence: number; // 0-1
};

const SOURCE_FETCH_LIMIT = 80;
const MAX_ITEMS_PER_SOURCE = 50;
const MAX_INSERTS_PER_RUN = 50;
const MAX_SUMMARIES_PER_RUN = 50;
const TARGET_QUALITY_INSERTS = 10;
const NOISE_KEYWORDS = [
  "opinion",
  "analysis",
  "how to",
  "guide",
  "newsletter",
  "podcast",
  "market update",
  "stock",
  "etf",
  "price target",
  "rumor",
  "watchlist",
];

// Keyword guardrail used *before* any LLM calls to avoid spending tokens on
// generic/news chatter. This does not rewrite or infer facts.
const SIGNAL_KEYWORDS = {
  funding: [
    "raised",
    "funding",
    "series a",
    "series b",
    "seed round",
    "investment",
    "venture",
    "backed by",
    "secured funding",
  ],
  hiring: [
    "appointed",
    "hired",
    "joins",
    "named",
    "promoted",
    "new ceo",
    "new cfo",
    "chief",
    "executive",
  ],
  product: [
    "launched",
    "introduced",
    "unveiled",
    "released",
    "new platform",
    "new feature",
    "rollout",
  ],
  acquisition: ["acquired", "acquisition", "merged", "merger", "bought", "takeover"],
} as const;
const SIMPLE_HEADLINE_KEYWORDS = {
  funding: [
    "funding", "raised funding", "raises funding", "raise capital", "venture capital", "series a", "series b", "series c",
    "seed round", "seed funding", "investment", "invested", "funded", "backed", "financing", "equity funding",
    "crowdfunding", "angel investment", "capital injection", "funding secured", "fundraising", "round closed",
  ],
  acquisition: [
    "merger", "acquisition", "acquired", "buyout", "joint venture", "partnership", "strategic alliance", "takeover",
    "merge", "deal closed", "business sale", "asset acquisition", "company acquired", "exit strategy", "spinoff", "divestment",
    "licensing deal",
  ],
  hiring: [
    "hire", "hires", "hiring", "recruiting", "new hire", "joined", "joined team", "executive hire", "leadership change",
    "promotion", "talent acquisition", "headcount increase", "team expansion", "cto appointed", "ceo appointed", "cfo appointed",
    "coo appointed", "downsizing", "restructuring",
  ],
  product: [
    "launch", "launched", "released", "rollout", "introduce", "announced product", "new service", "beta release",
    "version 2", "upgrade", "update", "product debut", "platform expansion", "feature launch", "ipo", "public listing",
    "listed", "stock market", "market expansion", "revenue growth", "profit increase", "earnings", "earnings report",
    "financial results", "quarterly results", "valuation", "valuation raised", "market share", "growth metrics",
    "profitability", "ai", "artificial intelligence", "machine learning", "ml", "deep learning", "blockchain", "fintech",
    "saas", "cloud computing", "digital transformation", "innovation", "disruptive technology", "automation", "iot",
    "internet of things", "tech adoption", "startup news", "scaleup", "growth stage", "market entry", "expansion",
    "new office", "subsidiary", "patent granted", "regulatory approval", "pivot",
  ],
} as const;

function passesKeywordFilter(item: FeedItem, _selectedSignalTypes: string[]) {
  const article_text = cleanText(item.title);
  const text = article_text.toLowerCase();
  const keywords = [
    ...SIMPLE_HEADLINE_KEYWORDS.funding,
    ...SIMPLE_HEADLINE_KEYWORDS.acquisition,
    ...SIMPLE_HEADLINE_KEYWORDS.hiring,
    ...SIMPLE_HEADLINE_KEYWORDS.product,
  ];

  // Fail-open: if keyword setup is broken or empty, include article.
  if (!Array.isArray(keywords) || keywords.length === 0) return true;
  return keywords.some(k => typeof k === "string" && k.length > 0 && text.includes(k));
}
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "Technology & AI": [
    "software",
    "technology",
    "it",
    "cloud",
    "developer",
    "saas",
    "ai",
    "artificial intelligence",
    "machine learning",
    "llm",
    "cybersecurity",
    "data",
    "platform",
    "enterprise software",
  ],
  "Fintech & Payments": ["fintech", "payments", "payment", "bank", "credit", "lending", "finance", "insurtech", "crypto"],
  "Ecommerce & Retail": ["ecommerce", "online store", "retail", "marketplace", "grocery", "fashion", "consumer goods"],
  "iGaming & Casino Tech": ["igaming", "casino", "sportsbook", "betting"],
  "Healthcare & Biotech": ["healthcare", "healthtech", "biotech", "pharma", "medical", "medical devices", "digital health"],
  "Logistics & Supply Chain": ["logistics", "supply chain", "freight", "shipping", "warehouse", "warehousing", "last mile", "delivery"],
  "Public Sector": ["government", "public sector", "municipal", "agency", "county", "city", "state", "department"],
  "Legal & Compliance": ["legal", "compliance", "regulatory", "audit", "law", "investigation", "contract"],
};
const NEWS_HOST_BLOCKLIST = [
  "news.google.com",
  "reuters.com",
  "hnrss.org",
  "ycombinator.com",
  "techcrunch.com",
  "bloomberg.com",
  "cnbc.com",
  "wsj.com",
  "ft.com",
];

// Host-based guardrails to avoid aggregator/syndication spam.
// Keep this conservative to avoid killing too many candidates.
const ORIGIN_HOST_BLOCKLIST = [
  "news.google.com",
  "newsbreak.com",
  "benzinga.com",
  "msn.com",
];

const ORIGIN_TRUSTED_HOSTS = [
  "reuters.com",
  "businesswire.com",
  "techcrunch.com",
  "venturebeat.com",
  "prnewswire.com",
  "globenewswire.com",
  "pitchbook.com",
  "producthunt.com",
  "crunchbase.com",
];
const companyDomainCache = new Map<string, string>();
const EVENT_VERB_REGEX =
  /\b(secures?|raises?|raised|acquires?|acquired|opens?|opening|announces?|launches?|partners?|expands?|cuts?|lays?\s+off|appoints?)\b/i;
const MAX_SIGNAL_AGE_DAYS = 7;
const ENTITY_BLOCKLIST = [
  "sheriff",
  "county sheriff",
  "police department",
  "fire department",
  "district attorney",
  "city council",
  "public works",
  "department of",
  "ministry of",
];
const HEADLINE_BLOCKLIST = [
  "on the move:",
  "appointments:",
  "people on the move",
  "reddit",
  "hacker news",
  "github - repo requires",
  "comments",
];
const COMMON_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "over", "under", "new", "office", "opens", "open",
  "funding", "raises", "raised", "acquires", "acquired", "acquisition", "launch", "launches", "growth",
  "expansion", "partner", "partnership", "continues", "continue", "momentum", "company", "startup", "platform",
  "software", "technology", "data", "cloud", "energy", "finance", "market", "service", "business", "regional",
  "global", "series", "million", "billion", "secures", "secured", "announces", "announcement", "hiring",
  "layoffs", "ceo", "cfo", "chief", "unit", "division", "portfolio", "region", "build", "builds",
]);
const SOURCE_TAG_HINTS: Record<string, string[]> = {
  techcrunch: ["Technology & AI"],
  venturebeat: ["Technology & AI"],
  ycombinator_hn: ["Technology & AI"],
  google_news_technology: ["Technology & AI"],
};
const signalAiCache = new Map<
  string,
  {
    accept: boolean;
    company: string;
    event: string;
    detail: string;
    signalType: (typeof SIGNAL_TYPES)[number];
    extraction?: ExtractedSignalData;
    classifiedAsSignal: boolean;
    passedExtraction: boolean;
    passedValidation: boolean;
  }
>();

function inferSignalType(title: string): (typeof SIGNAL_TYPES)[number] {
  const t = title.toLowerCase();
  if (t.includes("acquire") || t.includes("acquisition") || t.includes("merger") || t.includes("bought") || t.includes("takeover")) {
    return "acquisition";
  }
  if (
    t.includes("funding") ||
    t.includes("raises") ||
    t.includes("raised") ||
    t.includes("series ") ||
    t.includes("seed round") ||
    t.includes("investment") ||
    t.includes("venture")
  ) {
    return "funding";
  }
  if (t.includes("launch") || t.includes("introduces") || t.includes("unveils") || t.includes("released") || t.includes("rollout") || t.includes("new feature")) {
    return "product_launch";
  }
  if (t.includes("hiring") || t.includes("hired") || t.includes("hires") || t.includes("joins") || t.includes("appointed") || t.includes("new ceo") || t.includes("new cfo") || t.includes("chief")) {
    return "hiring_spike";
  }
  return "funding";
}

function inferCompanyName(title: string): string {
  const cleaned = normalizeBrokenPhrases(cleanUrlText(title)).replace(/\s+-\s+.+$/, "").trim();
  const eventMatch = cleaned.match(EVENT_VERB_REGEX);
  if (eventMatch && eventMatch.index != null && eventMatch.index > 1) {
    let candidate = cleaned.slice(0, eventMatch.index).trim();
    candidate = candidate
      .replace(/[,;:-]+$/g, "")
      .replace(/\bmost\s+innov(?:ative)?\b.*$/i, "")
      .replace(/\bsolution\b.*$/i, "")
      .replace(/\b(the|a|an)\s+$/i, "")
      .trim();
    if (candidate.endsWith("’s") || candidate.endsWith("'s")) {
      candidate = candidate.slice(0, -2).trim();
    }
    candidate = candidate
      .replace(/\b(?:m|n|mn)\s+$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = candidate.split(" ").filter(Boolean);
    if (tokens.length >= 2 && tokens[0].length <= 2) {
      candidate = tokens.slice(1).join(" ");
    }
    if (candidate.length >= 2) return candidate;
  }

  const separators = [" acquires ", " raises ", " opens ", " partners ", " launches "];
  let candidate = "";
  for (const separator of separators) {
    const idx = cleaned.toLowerCase().indexOf(separator);
    if (idx > 0) {
      candidate = cleaned.slice(0, idx).trim();
      break;
    }
  }
  if (!candidate) {
    candidate = cleaned.split(" ").slice(0, 4).join(" ");
  }
  candidate = candidate
    .replace(/^(ai\s+startup|startup|company|firm|platform|china['’]s|u\.?s\.?['’]s|uk['’]s)\s+/i, "")
    .replace(/\b(new\s+cfo|new\s+ceo|chief\s+\w+\s+officer)\b.*$/i, "")
    .replace(/\b(startup|company|firm)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return candidate || "Unknown company";
}

function normalizeCompanyName(raw: string): string {
  const cleaned = normalizeBrokenPhrases(cleanUrlText(raw))
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/[^a-zA-Z0-9&.'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 0) return "Unknown company";
  // Reject very weak company identifiers like "CS" or single-letter prefixes.
  if (tokens.length === 1 && tokens[0].length < 3) return "Unknown company";
  if (tokens.length >= 2 && tokens[0].length <= 1) return tokens.slice(1).join(" ");
  return tokens.slice(0, 5).join(" ");
}

function extractCompanyFromSourceText(title: string, description: string): string {
  const source = normalizeBrokenPhrases(cleanUrlText(`${title} ${description}`));
  const patterns = [
    /^([A-Z][A-Za-z0-9&.'\-\s]{1,60}?)\s+(?:raises?|raised|secures?|acquires?|acquired|opens?|launches?|announces?|partners?|expands?|appoints?)\b/i,
    /^([A-Z][A-Za-z0-9&.'\-\s]{1,60}?)\s*[:-]/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeCompanyName(match[1]);
      if (candidate !== "Unknown company") return candidate;
    }
  }
  return "Unknown company";
}

function classifyTags(title: string, description: string, configuredTags: string[], source?: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const inferred = new Set<string>();
  for (const [tag, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) inferred.add(tag);
  }

  // Verify against user-selected tags only; no fallback guessing.
  const selectedMatches = configuredTags.filter(tag => {
    const normalized = tag.toLowerCase();
    if (text.includes(normalized)) return true;
    return inferred.has(tag);
  });
  if (selectedMatches.length === 0 && source) {
    const hints = SOURCE_TAG_HINTS[source] ?? [];
    for (const hint of hints) {
      if (configuredTags.includes(hint)) selectedMatches.push(hint);
    }
  }
  return selectedMatches;
}

// NOTE: tag-specific Google News sources live in `signalsSources.ts`.

function stripHtml(value: string): string {
  const decoded = value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
  return decoded
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDirectEventStructure(title: string): boolean {
  const t = title.toLowerCase();
  if (t.includes("funding roundup") || t.includes("market update")) return false;
  return /( raises | raised | acquires | acquired | opens | opening | layoffs | lays off | appoints | launches | partners | secures | gets | buys | to acquire | expands )/.test(
    ` ${t} `,
  );
}

function computeSignalRelevance(
  item: FeedItem,
  selectedTags: string[],
  pass: 0 | 1,
): { score: number; direct: boolean } {
  const title = item.title.toLowerCase();
  const text = `${item.title} ${item.description}`.toLowerCase();
  const companyToken = item.companyName.split(" ").find(part => part.length >= 4)?.toLowerCase() ?? "";
  const tagMatches = selectedTags.filter(tag => text.includes(tag.toLowerCase())).length;

  let score = 0;
  if (title.includes(item.signalType.replaceAll("_", " "))) score += 0.2;
  if (hasDirectEventStructure(item.title)) score += 0.35;
  if (companyToken && title.includes(companyToken)) score += 0.2;
  if (tagMatches > 0) score += Math.min(0.25, tagMatches * 0.08);
  if (title.includes("company") || title.includes("startup") || title.includes("firm")) score += 0.05;

  if (NOISE_KEYWORDS.some(keyword => text.includes(keyword))) score -= 0.35;
  if (title.includes("?")) score -= 0.1;
  if (pass === 1 && item.signalType === "funding" && !title.includes("series")) score -= 0.1;
  if (item.companyName.toLowerCase() === "unknown company") score -= 0.3;

  const clamped = Math.max(0, Math.min(1, score));
  const threshold = pass === 0 ? 0.42 : 0.55;
  const hasDirect = hasDirectEventStructure(item.title);
  return {
    score: clamped,
    direct: clamped >= threshold && hasDirect,
  };
}

function reEvaluateSignalCandidate(item: FeedItem, selectedTags: string[]) {
  let bestScore = 0;
  for (const pass of [0, 1] as const) {
    const evaluation = computeSignalRelevance(item, selectedTags, pass);
    bestScore = Math.max(bestScore, evaluation.score);
    if (evaluation.direct) return { accepted: true, score: evaluation.score };
  }
  return { accepted: false, score: bestScore };
}

function linkHostname(link: string): string {
  try {
    return new URL(link).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isLikelyRepostOrSyndication(item: FeedItem): boolean {
  const t = `${item.title} ${item.description}`.toLowerCase();
  return /\b(reposted|republished|syndicated)\b/.test(t);
}

function originItemPriority(item: FeedItem): number {
  const host = linkHostname(item.link);
  if (ORIGIN_HOST_BLOCKLIST.includes(host)) return -10000;
  if (isLikelyRepostOrSyndication(item)) return -5000;

  let score = 0;

  // Prefer original feeds first (structured writing style tends to appear there).
  if (["reuters_business", "businesswire", "techcrunch", "venturebeat"].includes(item.source)) score += 200;
  if (item.source.startsWith("google_news_")) score += 40;
  if (item.source.startsWith("google_news_tag_")) score += 30;

  // Prefer trusted hostnames when we can detect them from the link.
  if (ORIGIN_TRUSTED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) score += 120;

  // Mild heuristic: richer descriptions usually correlate with structured reporting.
  if (item.description && item.description.length >= 180) score += 10;
  if (hasDirectEventStructure(item.title)) score += 15;

  return score;
}

function filterAndSortByOriginPolicy(items: FeedItem[]): FeedItem[] {
  return items
    .filter(it => originItemPriority(it) > -1000)
    .sort((a, b) => originItemPriority(b) - originItemPriority(a));
}

function isLikelyCompanyDomain(hostname: string): boolean {
  if (!hostname) return false;
  return !NEWS_HOST_BLOCKLIST.some(newsHost => hostname === newsHost || hostname.endsWith(`.${newsHost}`));
}

async function resolveCompanyWebsite(companyName: string, sourceLink: string): Promise<string> {
  const cacheKey = companyName.trim().toLowerCase();
  const cached = companyDomainCache.get(cacheKey);
  if (cached) return cached;

  const host = linkHostname(sourceLink);
  if (isLikelyCompanyDomain(host)) {
    const direct = `https://${host}`;
    companyDomainCache.set(cacheKey, direct);
    return direct;
  }

  try {
    const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`;
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (response.ok) {
      const payload = (await response.json()) as Array<{ domain?: string; name?: string }>;
      const best = payload.find(item => item.domain && item.name);
      if (best?.domain) {
        const resolved = `https://${best.domain}`;
        companyDomainCache.set(cacheKey, resolved);
        return resolved;
      }
    }
  } catch {
    // Ignore and fallback.
  }

  return `https://www.google.com/search?btnI=1&q=${encodeURIComponent(`${companyName} official website`)}`;
}

function eventVerb(signalType: (typeof SIGNAL_TYPES)[number]) {
  switch (signalType) {
    case "funding":
      return "raises funding";
    case "acquisition":
      return "announces an acquisition";
    case "hiring_spike":
      return "shows a hiring spike";
    case "product_launch":
      return "launches a product";
    default:
      return "announces an update";
  }
}

function cleanUrlText(input: string): string {
  return stripHtml(input)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bhref\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\btarget\s*=\s*["'][^"']*["']/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(htmlString: string): string {
  const decoded = htmlString
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );

  // Remove common site chrome (headers/footers/navigation boilerplate) if present.
  const noisePattern =
    /\b(skip to content|cookie policy|privacy policy|terms of use|all rights reserved|copyright|subscribe|sign in|sign up|log in|menu|navigation|breadcrumb|related articles)\b/i;
  const lines = decoded
    .split(/[\r\n\t]+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !noisePattern.test(line));

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function buildCleanArticleText(item: FeedItem): string {
  // Stage 1: deterministic cleanup only (no AI).
  // We treat RSS title + description as the available "article text".
  const text = `${item.title}\n${item.description}`;
  return cleanText(text);
}

function looksCorruptedText(input: string): boolean {
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return false;
  const stop = new Set(["in", "to", "of", "for", "and", "or", "at", "on", "by", "us", "uk", "ai"]);
  const suspiciousShort = tokens.filter(t => t.length <= 2 && !stop.has(t)).length;
  const gibberishFragments = ["beh he", "to sc us exp", "b tourn"];
  if (/^[A-Z]{1,3}(?:\s+[A-Z]{1,3}){3,}/.test(input)) return true;
  if (gibberishFragments.some(fragment => input.toLowerCase().includes(fragment))) return true;
  const noisyTokenRatio = suspiciousShort / tokens.length;
  const malformedLongTokens = tokens.filter(token => {
    if (token.length < 6) return false;
    const hasVowel = /[aeiou]/.test(token);
    const alphaOnly = /^[a-z]+$/.test(token);
    return alphaOnly && !hasVowel;
  }).length;
  const recognizedRatio =
    tokens.filter(token => token.length <= 2 || COMMON_WORDS.has(token) || /[0-9]/.test(token)).length /
    tokens.length;

  return noisyTokenRatio >= 0.42 || malformedLongTokens >= 2 || recognizedRatio < 0.28;
}

function shouldIgnoreSignal(item: FeedItem): boolean {
  const combined = `${item.companyName} ${item.title} ${item.description}`.toLowerCase();
  if (ENTITY_BLOCKLIST.some(term => combined.includes(term))) return true;
  if (HEADLINE_BLOCKLIST.some(term => combined.includes(term)) && !hasDirectEventStructure(item.title)) {
    return true;
  }
  if (
    /\b(us|u s|north korea|sanctions?|individuals?|officials?|government|state)\b/i.test(combined) &&
    /\b(firms?|individuals?|officials?)\b/i.test(combined)
  ) {
    return true;
  }
  if (/^\s*(us|u s)\s+\w+\s+\d+\s+firms?\b/i.test(item.title)) return true;
  if (/^\s*(on\s+the\s+move)\b/i.test(item.title.toLowerCase())) return true;
  if (/\b(russia|russian|north korea|sanctions?)\b/i.test(combined)) return true;
  if (/\b(url:\s*comments?|points?:\s*\d+)/i.test(combined)) return true;
  if (/\brepo requires\b/i.test(combined)) return true;
  if (looksCorruptedText(normalizeBrokenPhrases(cleanUrlText(item.title)))) return true;
  return false;
}

function eventSummaryFromTitle(item: FeedItem): string {
  const company = item.companyName.toLowerCase();
  let summary = normalizeBrokenPhrases(cleanUrlText(item.title));
  const eventMatch = summary.match(EVENT_VERB_REGEX);
  if (eventMatch && eventMatch.index != null && eventMatch.index > 1) {
    summary = summary.slice(eventMatch.index).trim();
  }
  if (summary.toLowerCase().startsWith(company)) {
    summary = summary.slice(item.companyName.length).trim();
  }
  summary = summary.replace(/^[-:|]\s*/, "");
  summary = summary.replace(/\s+-\s+[^-]{2,60}$/g, "");
  summary = summary.replace(/^[,;]\s*/, "");
  summary = summary.replace(/\bmost\s+innov(?:ative)?\b\s*-\s*/i, "");
  summary = summary.replace(/\bpublicceo\b$/i, "");
  summary = cleanUrlText(summary);
  if (!summary) summary = eventVerb(item.signalType);
  if (summary.length > 120) summary = summary.slice(0, 117).trimEnd() + "...";
  return summary;
}

function conciseEventTitle(item: FeedItem): string {
  const company = normalizeCompanyName(item.companyName);
  const summary = normalizeBrokenPhrases(cleanUrlText(eventSummaryFromTitle(item)))
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!summary) return `${company} - ${eventVerb(item.signalType)}`;
  return `${company} - ${summary}`;
}

function normalizeBrokenPhrases(input: string): string {
  return input
    .replace(/\bto\s+sc\s+us\s+exp\b/gi, "for US expansion")
    .replace(/\bto\s+us\s+exp\b/gi, "for US expansion")
    .replace(/\bsc\s+us\s+exp\b/gi, "US expansion")
    .replace(/\bb\s+tourn\b/gi, "")
    .replace(/\bnews\b$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizedDetails(item: FeedItem): string {
  const base = cleanUrlText(item.description || "");
  let cleaned = normalizeBrokenPhrases(base.replace(/\s-\s+read more.*$/i, "").trim());
  if (!cleaned || cleaned.length < 30) {
    cleaned = normalizeBrokenPhrases(cleanUrlText(item.title));
  }
  if (looksCorruptedText(cleaned)) {
    cleaned = normalizeBrokenPhrases(cleanUrlText(item.title));
  }
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return firstSentence.slice(0, 260);
}

function repairTitleEventStructure(item: FeedItem): { ok: boolean; company: string; event: string } {
  let company = normalizeCompanyName(item.companyName);
  let event = normalizeBrokenPhrases(cleanUrlText(eventSummaryFromTitle(item)));

  // Multi-pass repair loop: keep trying until "Title - Event" is valid or no progress.
  for (const _pass of [0, 1, 2] as const) {
    if (company === "Unknown company" || company.length < 3) {
      const recovered = extractCompanyFromSourceText(item.title, item.description);
      if (recovered !== "Unknown company") company = recovered;
    }
    if (!event || event.length < 8 || looksCorruptedText(event)) {
      event = normalizeBrokenPhrases(cleanUrlText(item.description || item.title));
      const firstSentence = event.split(/(?<=[.!?])\s+/)[0] ?? event;
      event = firstSentence;
    }

    event = event
      .replace(new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-:|]?\\s*`, "i"), "")
      .replace(/^[^a-zA-Z0-9]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!event) event = eventVerb(item.signalType);

    if (
      company !== "Unknown company" &&
      company.length >= 3 &&
      event.length >= 8 &&
      !looksCorruptedText(company) &&
      !looksCorruptedText(event)
    ) {
      return { ok: true, company, event: event.slice(0, 140) };
    }
  }
  return { ok: false, company, event };
}

function isRecentEnough(publishedAt: Date): boolean {
  return Date.now() - publishedAt.getTime() <= MAX_SIGNAL_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function normalizedFingerprintText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function signalFingerprint(item: FeedItem): string {
  const day = item.publishedAt.toISOString().slice(0, 10);
  const company = normalizedFingerprintText(item.companyName);
  const summary = normalizedFingerprintText(eventSummaryFromTitle(item)).slice(0, 80);
  return `${company}|${item.signalType}|${summary}|${day}`;
}

const DEDUPE_WINDOW_DAYS = 3;
const DEDUPE_SIMILARITY_THRESHOLD = 0.8;

function tokenizeForCosine(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function vectorizeTokens(tokens: string[]): Record<string, number> {
  const vec: Record<string, number> = {};
  tokens.forEach(t => {
    vec[t] = (vec[t] ?? 0) + 1;
  });
  return vec;
}

function cosineSimilarity(a: string, b: string): number {
  const tokensA = tokenizeForCosine(a);
  const tokensB = tokenizeForCosine(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const vecA = vectorizeTokens(tokensA);
  const vecB = vectorizeTokens(tokensB);
  const keysA = Object.keys(vecA);

  let dot = 0;
  let sumA = 0;
  for (const k of keysA) {
    const va = vecA[k] ?? 0;
    const vb = vecB[k] ?? 0;
    dot += va * vb;
    sumA += va * va;
  }

  let sumB = 0;
  const keysB = Object.keys(vecB);
  for (const k of keysB) {
    const vb = vecB[k] ?? 0;
    sumB += vb * vb;
  }

  const denom = Math.sqrt(sumA) * Math.sqrt(sumB);
  if (!denom) return 0;
  return dot / denom;
}

function withinDedupeWindow(a: Date, b: Date): boolean {
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff <= DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function localQualityAudit(
  item: FeedItem,
  company: string,
  event: string,
  detail: string,
  signalType?: string,
) {
  const normalizedCompany = normalizeCompanyName(company);
  const normalizedEvent = normalizeBrokenPhrases(cleanUrlText(event)).slice(0, 140);
  const normalizedDetail = normalizeBrokenPhrases(cleanUrlText(detail)).slice(0, 240);
  const combined = `${normalizedCompany} ${normalizedEvent} ${item.description}`.toLowerCase();
  const bad =
    normalizedCompany === "Unknown company" ||
    normalizedCompany.length < 3 ||
    normalizedEvent.length < 8 ||
    looksCorruptedText(normalizedCompany) ||
    looksCorruptedText(normalizedEvent) ||
    looksCorruptedText(normalizedDetail) ||
    /\b(url:\s*comments?|points?:\s*\d+)\b/i.test(combined);
  const normalizedType = SIGNAL_TYPES.includes((signalType ?? item.signalType) as (typeof SIGNAL_TYPES)[number])
    ? ((signalType ?? item.signalType) as (typeof SIGNAL_TYPES)[number])
    : item.signalType;
  return {
    accept: !bad,
    company: normalizedCompany,
    event: normalizedEvent,
    detail: normalizedDetail,
    signalType: normalizedType,
  };
}

function toCoarseSignalType(signalType: FeedItem["signalType"]): CoarseSignalType {
  if (signalType === "funding") return "funding";
  if (signalType === "acquisition") return "acquisition";
  if (signalType === "product_launch") return "product";
  return "hiring";
}

function deterministicClassify(
  articleText: string,
  fallbackType: FeedItem["signalType"],
): { hasSignal: boolean; signalType: CoarseSignalType | "none"; reason: string } {
  const text = articleText.toLowerCase();
  const classifierKeywords = SIMPLE_HEADLINE_KEYWORDS;

  const scores: Record<CoarseSignalType, number> = {
    funding: classifierKeywords.funding.filter(k => text.includes(k)).length,
    hiring: classifierKeywords.hiring.filter(k => text.includes(k)).length,
    product: classifierKeywords.product.filter(k => text.includes(k)).length,
    acquisition: classifierKeywords.acquisition.filter(k => text.includes(k)).length,
  };
  const hasAnyKeyword = Object.values(scores).some(v => v > 0);
  if (!hasAnyKeyword) {
    return { hasSignal: false, signalType: "none", reason: "No deterministic signal keyword match." };
  }
  const ranked = (Object.entries(scores) as Array<[CoarseSignalType, number]>).sort((a, b) => b[1] - a[1]);
  const topScore = ranked[0]?.[1] ?? 0;
  const topTypes = ranked.filter(([, s]) => s === topScore).map(([t]) => t);
  const fallbackCoarse = toCoarseSignalType(fallbackType);
  const chosenType = topTypes.includes(fallbackCoarse) ? fallbackCoarse : (topTypes[0] ?? fallbackCoarse);

  return {
    hasSignal: true,
    signalType: chosenType,
    reason: `Deterministic classifier matched ${chosenType} keywords.`,
  };
}

function logRejectedSignal(input: {
  reason: string;
  signal_type: string;
  article_title: string;
  extracted?: ExtractedSignalData;
}) {
  console.log("[Signals][Rejected]", JSON.stringify({
    title: input.article_title,
    signal_type: input.signal_type,
    reason: input.reason,
  }));
}

function logBeforeSavingSignal(item: FeedItem, extraction?: ExtractedSignalData) {
  const cleanedText = buildCleanArticleText(item);
  const payload = {
    title: item.title,
    signal_type: extraction?.signal_type ?? toCoarseSignalType(item.signalType),
    company: extraction?.company ?? item.companyName ?? null,
    person: extraction?.person ?? null,
    role: extraction?.role ?? null,
    amount: extraction?.amount ?? null,
    round: extraction?.round ?? null,
    cleaned_text_300: cleanedText.slice(0, 300),
  };
  console.log("[Signals][Saved]", JSON.stringify(payload));
}

function extractNearestProperNounBeforeKeyword(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  let bestIdx = -1;
  let matchedKeyword = "";
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
      matchedKeyword = kw;
    }
  }
  if (bestIdx < 0) return null;
  const before = text.slice(0, bestIdx);
  const properNouns = Array.from(before.matchAll(/\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,4})\b/g));
  if (properNouns.length === 0) return null;
  const candidate = properNouns[properNouns.length - 1]?.[1]?.trim() ?? null;
  if (!candidate || candidate.toLowerCase() === matchedKeyword.toLowerCase()) return null;
  return candidate;
}

function extractAmountLoose(text: string): string | null {
  const m =
    text.match(/\$[\d,.]+(?:\s?(?:m|bn|b|million|billion))?/i) ??
    text.match(/€[\d,.]+(?:\s?(?:m|mn|million|billion))?/i) ??
    text.match(/\b[\d,.]+\s?(?:m|mn|million|billion)\b/i);
  return m ? m[0] : null;
}

function extractFundingCompany(text: string): string | null {
  const m = text.match(/([A-Z][a-zA-Z0-9&\s]+?)\s+(raised|funded|backed)\b/);
  return m?.[1]?.trim() ?? null;
}

function extractHiringCompany(text: string): string | null {
  const m1 = text.match(/\b(?:joined|appointed|named)\s+([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4})\b/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = text.match(/\bat\s+([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4})\b/i);
  return m2?.[1]?.trim() ?? null;
}

function extractProductName(text: string): string | null {
  const m = text.match(/\b(?:launched|introduced|released|unveiled|rollout(?:\s+of)?)\s+([A-Z][A-Za-z0-9&.\-\s]{2,80})/i);
  return m?.[1]?.trim() ?? null;
}

function extractAcquisitionTarget(text: string): string | null {
  const m = text.match(/\b(?:acquired|acquires|buy|bought|merger with|merged with)\s+([A-Z][A-Za-z0-9&.\-\s]{2,80})/i);
  return m?.[1]?.trim() ?? null;
}

function validateExtractedSignalForSaving(extracted: ExtractedSignalData): {
  save: boolean;
  reason_if_rejected: string;
} {
  // Rules:
  // - If company exists OR person exists -> accept
  // - Missing amount / role / round -> OK
  // - Preserve full text for context
  // - Do NOT shorten or modify fields
  return { save: true, reason_if_rejected: "" };
}

async function classifySignalWithAI(
  item: FeedItem,
): Promise<{ hasSignal: boolean; signalType: CoarseSignalType | "none"; reason: string }> {
  const articleText = cleanText(item.title);
  const fallback = deterministicClassify(articleText, item.signalType);
  console.log(
    "[Signals][ClassifierRaw]",
    `title=${item.title}`,
    `text_300=${articleText.slice(0, 300)}`,
    `raw=${JSON.stringify(fallback)}`,
  );
  return fallback;
}

function mapCoarseSignalTypeToInternal(signal_type: CoarseSignalType): (typeof SIGNAL_TYPES)[number] {
  switch (signal_type) {
    case "funding":
      return "funding";
    case "hiring":
      return "hiring_spike";
    case "product":
      return "product_launch";
    case "acquisition":
      return "acquisition";
  }
}

function countWords(input: string): number {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function looksLikeUrl(input: string): boolean {
  return /\bhttps?:\/\/\S+/i.test(input) || /\bwww\.\S+/i.test(input);
}

function hasNonEmptyString(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWhitespaceForMatch(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeEntityForMatch(input: string): string {
  return normalizeWhitespaceForMatch(
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, " ")
      .replace(/\s+/g, " "),
  );
}

function containsHtmlLike(input: string): boolean {
  return /<[^>]+>/.test(input) || /&[a-z]+;/i.test(input) || /&#\d+;/i.test(input);
}

function isValuePresentInArticle(value: string, articleText: string): boolean {
  const v = normalizeEntityForMatch(value);
  const art = normalizeEntityForMatch(articleText);
  if (!v) return false;
  if (v.length < 3) return false;
  return art.includes(v);
}

function isExactSentenceInArticle(evidence: string, articleText: string): boolean {
  const ev = normalizeWhitespaceForMatch(evidence);
  const art = normalizeWhitespaceForMatch(articleText);
  if (!ev) return false;
  if (ev.length < 20) return false;
  // Require exact substring match after whitespace normalization.
  return art.includes(ev);
}

async function extractEvidenceSentenceWithAI(clean_article_text: string): Promise<string> {
  const sentences = clean_article_text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const fallback =
    sentences.find(s =>
      /\b(raised|funding|series|seed|appointed|hired|joins|launched|introduced|released|acquired|acquisition|merged|merger|bought|takeover)\b/i.test(
        s,
      ),
    ) ?? sentences[0] ?? "";
  return fallback;
}

function normalizeCompanyNameForFields(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isUnknown = trimmed.toLowerCase() === "unknown company";
  if (isUnknown) return trimmed;

  // Remove common legal suffixes if the remaining string is still a valid company name.
  // Note: we do not remove everything; we only trim well-known suffixes.
  const suffixRegex =
    /(?:\s*,?\s*)?(inc\.?|incorporated|ltd\.?|limited|llc|l\.p\.|lp|corp\.?|corporation|co\.?|company|plc|gmbh|s\.a\.|sa|sarl|ag|holdings|group)\s*$/i;

  const cleaned = trimmed.replace(suffixRegex, "").replace(/[.,]+$/g, "").trim();
  if (cleaned.length >= 2 && /[A-Za-z]/.test(cleaned)) return cleaned;
  return trimmed;
}

function titleCaseName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  return s
    .split(/\s+/g)
    .map(word => {
      // Preserve apostrophes/hyphens by title-casing subparts.
      return word
        .split(/([-'])/g)
        .map(part => {
          if (part === "-" || part === "'") return part;
          if (!/[A-Za-z]/.test(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("");
    })
    .join(" ");
}

function normalizeRole(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const roleMap: Record<string, string> = {
    ceo: "CEO",
    cfo: "CFO",
    cto: "CTO",
    coo: "COO",
    cio: "CIO",
    cmo: "CMO",
    ciso: "CISO",
    president: "President",
    founder: "Founder",
  };
  if (roleMap[lower]) return roleMap[lower];

  // Human-readable casing for multi-word roles.
  return titleCaseName(trimmed);
}

function normalizeRound(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const m = trimmed.match(/series\s*([a-z])/i);
  if (m?.[1]) {
    return `Series ${m[1].toUpperCase()}`;
  }
  if (/seed\s*round/i.test(trimmed)) return "Seed round";

  // Default: title-case words (doesn't invent missing data).
  return titleCaseName(trimmed);
}

function normalizeCurrency(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "$" || trimmed === "€" || trimmed === "£") return trimmed;
  if (/^[a-z]{3}$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizeDomainRootOnly(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.trim();
  if (!d) return null;
  // Strip schemes.
  d = d.replace(/^https?:\/\//i, "");
  // Strip paths/query/fragment.
  d = d.split(/[/?#]/)[0] ?? "";
  d = d.trim();
  if (!d) return null;
  d = d.toLowerCase();
  // Strip leading www only.
  d = d.replace(/^www\./i, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) return null;

  const publicSuffix3Labels = [
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "com.au",
    "net.au",
    "org.au",
    "edu.au",
    "co.jp",
    "com.br",
  ];

  const labels = d.split(".").filter(Boolean);
  if (labels.length <= 2) return d;

  const suffix = d.slice(d.indexOf(labels[labels.length - 2])); // last 2+ parts
  const hostname = d;
  const endsWithPublicSuffix3 = publicSuffix3Labels.some(s => hostname.endsWith(`.${s}`));
  if (endsWithPublicSuffix3) {
    // e.g. sub.example.co.uk => example.co.uk
    return labels.slice(-3).join(".");
  }
  // Otherwise: last 2 labels only (best-effort root-only).
  return labels.slice(-2).join(".");
}

function normalizeDomainConfidence(raw: number | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeExtractedFieldsForEvidence(
  extracted: ExtractedSignalData,
): {
  company: string | null;
  signal_type: string;
  amount: string | null;
  currency: string | null;
  round: string | null;
  person: string | null;
  role: string | null;
  product_name: string | null;
  domain: string | null;
  website_url: string | null;
  domain_confidence: number | null;
  company_aliases: string[] | null;
  date: string | null;
} {
  const domain = normalizeDomainRootOnly(extracted.domain);
  const normalizedAliases = (() => {
    if (extracted.company_aliases == null) return null;
    const cleaned = extracted.company_aliases
      .map(a => a.trim())
      .filter(a => a.length >= 2)
      .filter(a => !containsHtmlLike(a));
    if (cleaned.length === 0) return null;
    // Keep deterministic cap (dropping items is not inventing).
    return cleaned.slice(0, 10);
  })();
  return {
    company: normalizeCompanyNameForFields(extracted.company),
    signal_type: extracted.signal_type,
    amount: extracted.amount ? extracted.amount.trim() : null,
    currency: normalizeCurrency(extracted.currency),
    round: normalizeRound(extracted.round),
    person: extracted.person ? titleCaseName(extracted.person) : null,
    role: normalizeRole(extracted.role),
    product_name: extracted.product_name ? titleCaseName(extracted.product_name) : null,
    domain,
    website_url: domain ? `https://${domain}` : null,
    domain_confidence:
      domain ? normalizeDomainConfidence(extracted.domain_confidence) : null,
    company_aliases: normalizedAliases,
    date: normalizeDate(extracted.date),
  };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function limitToMaxWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
}

type NormalizedSignalForSentence = ReturnType<typeof normalizeExtractedFieldsForEvidence> & {
  target_company_if_available?: string | null;
};

function singleBusinessSignalSentence(normalized: NormalizedSignalForSentence): string | null {
  const company = normalized.company;
  if (!company) return null;

  const signalType = normalized.signal_type;

  let sentence: string | null = null;
  // Generate strictly from provided fields. No invented missing values.
  if (signalType === "funding") {
    if (normalized.amount && normalized.round) {
      sentence = `${company} raised ${normalized.amount} ${normalized.round}`;
    } else if (normalized.amount) {
      sentence = `${company} raised ${normalized.amount}`;
    } else if (normalized.round) {
      sentence = `${company} raised ${normalized.round}`;
    } else {
      sentence = null;
    }
  } else if (signalType === "hiring") {
    if (normalized.person && normalized.role) {
      sentence = `${normalized.person} joined ${company} as ${normalized.role}`;
    } else if (normalized.person) {
      sentence = `${normalized.person} joined ${company}`;
    } else {
      sentence = null;
    }
  } else if (signalType === "product") {
    const p = normalized.product_name;
    if (!p) return null;
    sentence = `${company} launched ${p}`;
  } else if (signalType === "acquisition") {
    const t = normalized.target_company_if_available;
    if (!t) return null;
    sentence = `${company} acquired ${t}`;
  } else {
    return null;
  }

  if (!sentence) return null;

  sentence = sentence.replace(/\s+/g, " ").trim();

  // Enforce "one sentence": if the candidate contains multiple sentence terminators, reject.
  const terminators = (sentence.match(/[.!?]/g) ?? []).length;
  if (terminators > 1) return null;

  // Enforce <= 20 words by trimming the variable tail (no invention).
  const words = wordCount(sentence);
  if (words <= 20) return sentence;

  // If it's too long, attempt to trim only the free-form part.
  // For funding/hiring we only have amount/round/person/role; for product/acquisition we trim the placeholder.
  const fixedPrefix =
    signalType === "funding"
      ? `${company} raised`
      : signalType === "hiring"
        ? normalized.role
          ? `${normalized.person} joined ${company} as`
          : `${normalized.person} joined ${company}`
        : signalType === "product"
          ? `${company} launched`
          : `${company} acquired`;

  const prefixWords = wordCount(fixedPrefix);
  const remaining = Math.max(0, 20 - prefixWords);

  if (remaining === 0) return null;
  if (signalType === "funding") {
    const tail =
      normalized.amount && normalized.round
        ? `${normalized.amount} ${normalized.round}`
        : normalized.amount ?? normalized.round ?? "";
    const trimmedTail = limitToMaxWords(tail, remaining);
    const candidate = `${fixedPrefix} ${trimmedTail}`.trim();
    return wordCount(candidate) <= 20 && trimmedTail.length > 0 ? candidate : null;
  }
  if (signalType === "hiring") {
    // If role missing, sentence already had the shorter template.
    if (!normalized.role) {
      const candidate = limitToMaxWords(sentence ?? "", 20);
      return wordCount(candidate) <= 20 ? candidate : null;
    }
    const tail = `${normalized.role}`;
    const trimmedTail = limitToMaxWords(tail, remaining);
    const candidate = `${fixedPrefix} ${trimmedTail}`.trim();
    return wordCount(candidate) <= 20 && trimmedTail.length > 0 ? candidate : null;
  }
  if (signalType === "product") {
    const tail = normalized.product_name ?? "";
    const trimmedTail = limitToMaxWords(tail, remaining);
    const candidate = `${fixedPrefix} ${trimmedTail}`.trim();
    return wordCount(candidate) <= 20 ? candidate : null;
  }
  // acquisition
  const tail = normalized.target_company_if_available ?? "";
  const trimmedTail = limitToMaxWords(tail, remaining);
  const candidate = `${fixedPrefix} ${trimmedTail}`.trim();
  return wordCount(candidate) <= 20 ? candidate : null;
}

function deterministicExtractStructured(item: FeedItem): ExtractedSignalData {
  const clean = cleanText(item.title);
  const coarse = toCoarseSignalType(item.signalType);
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0]?.trim() ?? item.title;
  const amount = extractAmountLoose(clean);
  const roundMatch = clean.match(/\b(series\s+[a-z]|seed\s+round|seed)\b/i);
  const personRoleMatch = clean.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:appointed|joined|named)\b[\s\S]{0,100}?\bas\s+([A-Za-z][A-Za-z\s-]{2,40})\b/i,
  );
  const productName = extractProductName(clean);
  const acquisitionTarget = extractAcquisitionTarget(clean);
  const fundingKeywords = ["raised", "funding", "investment"];
  const hiringKeywords = ["appointed", "joined", "named"];
  const fundingCompanyByPattern = extractFundingCompany(clean);
  const fundingCompany = extractNearestProperNounBeforeKeyword(clean, fundingKeywords);
  const hiringPerson = extractNearestProperNounBeforeKeyword(clean, hiringKeywords);
  const roleAfterAs = clean.match(/\bas\s+([A-Za-z][A-Za-z\s-]{2,50})\b/i)?.[1]?.trim() ?? null;
  const hiringCompany = extractHiringCompany(clean);
  const evidence =
    clean
      .split(/(?<=[.!?])\s+/)
      .find(s =>
        /\b(raised|funding|series|seed|appointed|hired|joins|launched|introduced|released|acquired|acquisition|merged|merger|bought|takeover)\b/i.test(
          s,
        ),
      )
      ?.trim() ?? firstSentence;

  return {
    company:
      coarse === "funding"
        ? (fundingCompanyByPattern ?? fundingCompany ?? item.companyName) || inferCompanyName(item.title)
        : coarse === "hiring"
          ? (hiringCompany ?? item.companyName) || inferCompanyName(item.title)
          : item.companyName || inferCompanyName(item.title),
    signal_type: coarse,
    text: clean,
    summary:
      coarse === "acquisition" && acquisitionTarget
        ? `${(item.companyName || inferCompanyName(item.title)).trim()} acquired ${acquisitionTarget}`
        : clean,
    date: item.publishedAt.toISOString().slice(0, 10),
    amount: amount,
    currency: amount ? amount[0] : null,
    round: roundMatch ? roundMatch[0] : null,
    person: coarse === "hiring" ? hiringPerson ?? (personRoleMatch ? personRoleMatch[1] : null) : null,
    role: coarse === "hiring" ? roleAfterAs ?? (personRoleMatch ? personRoleMatch[2] : null) : null,
    product_name: coarse === "product" ? productName : null,
    domain: null,
    website_url: null,
    domain_confidence: null,
    company_aliases: null,
    evidence,
    confidence: 0.72,
  };
}

async function extractStructuredSignalDataWithAI(item: FeedItem): Promise<ExtractedSignalData> {
  return deterministicExtractStructured(item);
}

async function extractAndValidateSignal(
  item: FeedItem,
  company: string,
  event: string,
): Promise<{
  accept: boolean;
  company: string;
  event: string;
  detail: string;
  signalType: FeedItem["signalType"];
  extraction?: ExtractedSignalData;
  classifiedAsSignal: boolean;
  passedExtraction: boolean;
  passedValidation: boolean;
}> {
  const key = `${item.title}|||${item.description}`.slice(0, 400);
  const cached = signalAiCache.get(key);
  if (cached) return cached;
  try {
    const classification = await classifySignalWithAI(item);
    if (!classification.hasSignal) {
      logRejectedSignal({
        reason: `classifier_rejected:${classification.reason}`,
        signal_type: item.signalType,
        article_title: item.title,
      });
      const result = {
        accept: false,
        company,
        event,
        detail: "",
        signalType: item.signalType,
        classifiedAsSignal: false,
        passedExtraction: false,
        passedValidation: false,
      };
      signalAiCache.set(key, result);
      return result;
    }

    const extracted = await extractStructuredSignalDataWithAI(item);
    const clean_article_text = buildCleanArticleText(item);

    // Deterministic domain resolution (no LLM).
    // Overrides AI-extracted domain fields to keep them grounded and consistent.
    const domainResolved = await resolveCompanyDomainDeterministic({
      company,
      article_html: item.article_html,
      article_text: clean_article_text,
    });

    extracted.domain = domainResolved.domain;
    extracted.domain_confidence = domainResolved.domain_confidence;
    extracted.website_url = domainResolved.domain ? `https://${domainResolved.domain}` : null;

    // Enforce deterministic confidence cutoff.
    if (extracted.domain_confidence != null && extracted.domain_confidence < 0.6) {
      extracted.domain = null;
      extracted.website_url = null;
      extracted.domain_confidence = null;
    }

    const normalizedForEvidence = normalizeExtractedFieldsForEvidence(extracted);
    const evidenceSentence = await extractEvidenceSentenceWithAI(clean_article_text);
    extracted.evidence = evidenceSentence || extracted.evidence;
    // Apply normalization to extracted fields before storing/validation.
    extracted.company = normalizedForEvidence.company ?? extracted.company;
    extracted.signal_type = normalizedForEvidence.signal_type as CoarseSignalType;
    extracted.amount = normalizedForEvidence.amount;
    extracted.currency = normalizedForEvidence.currency;
    extracted.round = normalizedForEvidence.round;
    extracted.person = normalizedForEvidence.person;
    extracted.role = normalizedForEvidence.role;
    extracted.product_name = normalizedForEvidence.product_name;
    extracted.domain = normalizedForEvidence.domain;
    extracted.website_url = normalizedForEvidence.website_url;
    extracted.domain_confidence = normalizedForEvidence.domain_confidence;
    extracted.company_aliases = normalizedForEvidence.company_aliases;
    extracted.date = normalizedForEvidence.date;

    // Stage 4 (no AI): validation-only guards (no inference).
    const extractedCompany = extracted.company;
    const extractedSummary = extracted.summary ?? "";
    const extractedEvidence = extracted.evidence ?? "";
    const evidenceOk =
      extractedEvidence.trim().length === 0 ||
      (!looksLikeUrl(extractedEvidence) && !containsHtmlLike(extractedEvidence));
    const summaryOk = extractedSummary.trim().length === 0 || !containsHtmlLike(extractedSummary);
    const confidenceOk = Number.isFinite(extracted.confidence) && extracted.confidence >= 0 && extracted.confidence <= 1;

    const extractedDomain = extracted.domain ?? null;
    const extractedWebsiteUrl = extracted.website_url ?? null;
    const extractedDomainConfidence = extracted.domain_confidence ?? null;

    const domainOk =
      extractedDomain == null
        ? extractedWebsiteUrl == null && extractedDomainConfidence == null
        : extractedWebsiteUrl === `https://${extractedDomain}` &&
          extractedDomainConfidence != null &&
          Number.isFinite(extractedDomainConfidence) &&
          extractedDomainConfidence >= 0 &&
          extractedDomainConfidence <= 1 &&
          !containsHtmlLike(extractedDomain);

    const websiteOk =
      extractedWebsiteUrl == null
        ? true
        : extractedWebsiteUrl === `https://${extractedDomain}` && !containsHtmlLike(extractedWebsiteUrl);

    const companyExists = hasNonEmptyString(extractedCompany);
    const personExists = hasNonEmptyString(extracted.person);
    const companyOk = extractedCompany == null || !containsHtmlLike(extractedCompany);
    const personOk = extracted.person == null || !containsHtmlLike(extracted.person);
    const roleOk = extracted.role == null || !containsHtmlLike(extracted.role);
    const aliasesOk =
      extracted.company_aliases == null ||
      extracted.company_aliases.every(alias => {
        if (!alias) return false;
        if (containsHtmlLike(alias)) return false;
        return true;
      });
    const amountOk = extracted.amount == null || !containsHtmlLike(extracted.amount);
    const currencyOk = extracted.currency == null || !containsHtmlLike(extracted.currency);
    const roundOk = extracted.round == null || !containsHtmlLike(extracted.round);
    const dateOk = extracted.date == null || !containsHtmlLike(extracted.date);

    const failedFormatValidation =
      !domainOk ||
      !websiteOk ||
      !summaryOk ||
      !evidenceOk ||
      !confidenceOk ||
      !companyOk ||
      !personOk ||
      !roleOk ||
      !aliasesOk ||
      !amountOk ||
      !currencyOk ||
      !roundOk ||
      !dateOk;
    if (failedFormatValidation) {
      const formatFailures: string[] = [];
      if (!domainOk) formatFailures.push("domain");
      if (!websiteOk) formatFailures.push("website");
      if (!summaryOk) formatFailures.push("summary");
      if (!evidenceOk) formatFailures.push("evidence");
      if (!confidenceOk) formatFailures.push("confidence");
      if (!companyOk) formatFailures.push("company");
      if (!personOk) formatFailures.push("person");
      if (!roleOk) formatFailures.push("role");
      if (!aliasesOk) formatFailures.push("aliases");
      if (!amountOk) formatFailures.push("amount");
      if (!currencyOk) formatFailures.push("currency");
      if (!roundOk) formatFailures.push("round");
      if (!dateOk) formatFailures.push("date");
      logRejectedSignal({
        reason: `format_validation_failed:${formatFailures.join(",")}`,
        signal_type: extracted.signal_type,
        article_title: item.title,
        extracted,
      });
    }

    const internalSignalType = mapCoarseSignalTypeToInternal(extracted.signal_type);
    // Prompt-equivalent validation output:
    // { save: true/false, reason_if_rejected: "" }
    const saveDecision = validateExtractedSignalForSaving(extracted);
    if (!saveDecision.save) {
      logRejectedSignal({
        reason: `category_validation_failed:${saveDecision.reason_if_rejected}`,
        signal_type: extracted.signal_type,
        article_title: item.title,
        extracted,
      });
      const result = {
        accept: false,
        company: extracted.company ?? "Unknown company",
        event: extracted.summary || event,
        detail: extracted.evidence || "",
        signalType: item.signalType,
        classifiedAsSignal: true,
        passedExtraction: true,
        passedValidation: false,
      };
      signalAiCache.set(key, result);
      return result;
    }

    // Preserve full extracted text/context; do not summarize or truncate.
    extracted.summary = extracted.summary || extracted.text || `${extractedCompany ?? "Unknown company"} - ${event}`;
    const sentenceForAudit = extracted.summary;

    const audited = localQualityAudit(
      item,
      extractedCompany ?? "Unknown company",
      sentenceForAudit,
      extractedEvidence,
      internalSignalType,
    );

    const result = {
      ...audited,
      extraction: extracted,
      // Permissive storage mode: keep partial signals instead of dropping them.
      accept: true,
      classifiedAsSignal: true,
      passedExtraction: true,
      passedValidation: true,
    };
    if (!audited.accept) {
      logRejectedSignal({
        reason: "local_quality_audit_rejected_but_stored_partial",
        signal_type: extracted.signal_type,
        article_title: item.title,
        extracted,
      });
    }
    signalAiCache.set(key, result);
    return result;
  } catch {
    logRejectedSignal({
      reason: "pipeline_exception",
      signal_type: item.signalType,
      article_title: item.title,
    });
    const result = {
      accept: false,
      company,
      event,
      detail: "",
      signalType: item.signalType,
      classifiedAsSignal: false,
      passedExtraction: false,
      passedValidation: false,
    };
    signalAiCache.set(key, result);
    return result;
  }
}

function extractRssItems(source: string, xml: string, seedTag?: string): FeedItem[] {
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(
    0,
    MAX_ITEMS_PER_SOURCE,
  );
  return items
    .map(match => match[1])
    .map(raw => {
      const title = (raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
        .trim();
      const descriptionHtml =
        raw.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
      const description = stripHtml(descriptionHtml);
      const link = (raw.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const pubDate = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
      const publishedAt = pubDate ? new Date(pubDate) : new Date();
      const cleanTitle = stripHtml(title);
      const normalizedTitle = cleanText(cleanTitle);
      const companyName = inferCompanyName(cleanTitle);
      const signalType = inferSignalType(normalizedTitle);
      return {
        source,
        title: normalizedTitle,
        description: cleanText(description),
        article_html: descriptionHtml,
        link,
        publishedAt,
        companyName,
        signalType,
        tags: [],
        seedTags: seedTag ? [seedTag] : [],
      };
    })
    .filter(item => item.title && item.link);
}

async function collectSourceFeed(source: string, url: string, seedTag?: string): Promise<FeedItem[]> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "BehbergSignalsBot/1.0 (+https://behberg.com)",
      accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Source fetch failed (${source}): ${response.status}`);
  }
  const xml = await response.text();
  return extractRssItems(source, xml, seedTag);
}

function makeExternalId(item: FeedItem, organizationId: number) {
  const key = `${organizationId}:${signalFingerprint(item)}`;
  return createHash("sha256").update(key).digest("hex");
}

export async function refreshSignalsForOrganization(organizationId: number) {
  const profile = (await getSignalProfile(organizationId)) ?? {
    organizationId,
    businessType: "other",
    selectedTags: [] as string[],
    selectedSignalTypes: [] as string[],
    sourcesEnabled: [] as string[],
    refreshCadenceMinutes: 30,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const debug = true;
  const debugLog = (...args: Array<unknown>) => {
    if (!debug) return;
    console.log("[Signals][Debug]", ...args);
  };
  const stageCounters = {
    total_articles: 0,
    after_keyword_filter: 0,
    classified_as_signal: 0,
    passed_extraction: 0,
    passed_validation: 0,
    final_signals_saved: 0,
  };

  type AcceptedDedupeEntry = {
    id: number;
    occurredAt: Date;
    summaryText: string;
    confidence: number;
  };

  // Candidates are filtered to the last `MAX_SIGNAL_AGE_DAYS` by the main pipeline.
  // Two duplicates can be up to 3 days apart, so we must look back `MAX_SIGNAL_AGE_DAYS + 3`.
  const dedupeSince = new Date(
    Date.now() - (MAX_SIGNAL_AGE_DAYS + DEDUPE_WINDOW_DAYS) * 24 * 60 * 60 * 1000,
  );
  // Dedupe is "same company + same signal type" + "within 3 days" + "cosine similarity".
  const runAcceptedByKey = new Map<string, AcceptedDedupeEntry[]>();
  const existingDedupeCache = new Map<string, Awaited<ReturnType<typeof listSignalsForDedupe>>>();

  const getExistingForDedupe = async (companyName: string, signalType: string) => {
    const cacheKey = `${organizationId}|${companyName}|${signalType}`;
    const cached = existingDedupeCache.get(cacheKey);
    if (cached) return cached;
    const rows = await listSignalsForDedupe({
      organizationId,
      companyName,
      signalType,
      since: dedupeSince,
      limit: 200,
    });
    existingDedupeCache.set(cacheKey, rows);
    return rows;
  };

  const maybeDedupeCandidate = async (input: {
    companyName: string;
    signalType: string;
    occurredAt: Date;
    summaryText: string;
    confidence: number;
  }): Promise<boolean> => {
    const { companyName, signalType, occurredAt, summaryText, confidence } = input;

    const key = `${companyName}|${signalType}`;
    const existing = await getExistingForDedupe(companyName, signalType);
    const runAccepted = runAcceptedByKey.get(key) ?? [];

    const existingDupes = existing.filter(
      e => withinDedupeWindow(e.occurredAt, occurredAt) && cosineSimilarity(summaryText, e.summaryText) > DEDUPE_SIMILARITY_THRESHOLD,
    );
    const runDupes = runAccepted.filter(
      e => withinDedupeWindow(e.occurredAt, occurredAt) && cosineSimilarity(summaryText, e.summaryText) > DEDUPE_SIMILARITY_THRESHOLD,
    );

    const dupes = [...existingDupes, ...runDupes];
    if (dupes.length === 0) return true;

    const maxExistingConfidence = Math.max(...dupes.map(d => d.confidence));
    if (confidence <= maxExistingConfidence) return false; // keep highest confidence only

    // Candidate has strictly higher confidence than all duplicates → replace them.
    const idsToDelete = new Set(dupes.map(d => d.id));
    const ids = Array.from(idsToDelete);
    for (const id of ids) {
      await deleteSignalAndInsight(id);
    }

    // Update caches to avoid re-comparing against deleted rows.
    if (existingDupes.length > 0) {
      const cacheKey = `${organizationId}|${companyName}|${signalType}`;
      const cached = existingDedupeCache.get(cacheKey) ?? [];
      existingDedupeCache.set(
        cacheKey,
        cached.filter(r => !idsToDelete.has(r.id)),
      );
    }

    if (runDupes.length > 0) {
      runAcceptedByKey.set(
        key,
        runAccepted.filter(r => !idsToDelete.has(r.id)),
      );
    }

    return true;
  };

  const sourceBase: SignalSource[] = getSourcesForProfile({
    sourcesEnabled: profile.sourcesEnabled ?? [],
    selectedTags: profile.selectedTags ?? [],
  });
  const tagSpecificSources = buildTagSpecificSources(profile.selectedTags ?? []);

  const sourceSlice = [...sourceBase.slice(0, SOURCE_FETCH_LIMIT + 2), ...tagSpecificSources].slice(
    0,
    SOURCE_FETCH_LIMIT + 6,
  );
  let fetchedCount = 0;
  let insertedCount = 0;
  let summarizedCount = 0;
  const fallbackCandidates: FeedItem[] = [];

  for (const source of sourceSlice) {
    const runId = await createSignalIngestionRun({ organizationId, source: source.source });
    try {
      const feedItems = await collectSourceFeed(
        source.source,
        source.url,
        "seedTag" in source ? source.seedTag : undefined,
      );
      fetchedCount += feedItems.length;
      stageCounters.total_articles += feedItems.length;
      const sortedCandidates = filterAndSortByOriginPolicy(feedItems);
      const cappedItems = sortedCandidates.slice(0, MAX_INSERTS_PER_RUN - insertedCount);

      let keywordPassedCount = 0;
      let extractedAcceptedCount = 0;
      let dedupeAllowedCount = 0;
      let tagFallbackUsedCount = 0;
      let insertedThisSource = 0;
      let summarizedThisSource = 0;

      for (const item of cappedItems) {
        if (!isRecentEnough(item.publishedAt)) continue;
        fallbackCandidates.push(item);
        item.companyName = normalizeCompanyName(item.companyName);
        if (!passesKeywordFilter(item, profile.selectedSignalTypes ?? [])) {
          continue;
        }
        stageCounters.after_keyword_filter += 1;
        keywordPassedCount += 1;

        const audited = await extractAndValidateSignal(
          item,
          item.companyName,
          item.title,
        );
        if (audited.classifiedAsSignal) stageCounters.classified_as_signal += 1;
        if (audited.passedExtraction) stageCounters.passed_extraction += 1;
        if (audited.passedValidation) stageCounters.passed_validation += 1;
        if (!audited.accept) continue;
        extractedAcceptedCount += 1;
        item.companyName = audited.company;
        item.signalType = audited.signalType;

        const candidateSummaryText =
          audited.extraction?.summary ?? `${audited.company} - ${audited.event}`;
        const candidateConfidence = Number(audited.extraction?.confidence ?? 0);
        const allowed = await maybeDedupeCandidate({
          companyName: item.companyName,
          signalType: item.signalType,
          occurredAt: item.publishedAt,
          summaryText: candidateSummaryText,
          confidence: Number.isFinite(candidateConfidence) ? candidateConfidence : 0,
        });
        if (!allowed) continue;
        dedupeAllowedCount += 1;

        const classified = classifyTags(
          item.title,
          item.description,
          profile.selectedTags ?? [],
          item.source,
        );
        const canUseSeedTag =
          item.source.startsWith("google_news_tag_") &&
          item.seedTags.some(tag => (profile.selectedTags ?? []).includes(tag));
        const tags = Array.from(
          new Set([
            ...classified,
            ...(classified.length > 0 || !canUseSeedTag ? [] : item.seedTags),
          ]),
        );
      // If tag inference is empty, fall back to user's configured tags (or seed tag).
      if ((profile.selectedTags ?? []).length > 0 && tags.length === 0) {
        const fallbackTags =
          item.seedTags.length > 0 ? item.seedTags : (profile.selectedTags ?? []);
        if (fallbackTags.length > 0) {
          tags.push(...fallbackTags);
          tagFallbackUsedCount += 1;
        }
      }
        logBeforeSavingSignal(item, audited.extraction);
        const upsert = await upsertSignalItem({
          organizationId,
          source: item.source,
          externalId: makeExternalId(item, organizationId),
          signalType: item.signalType,
          companyName: item.companyName,
          headline: item.title,
          url: item.link,
          tags,
          occurredAt: item.publishedAt,
          ingestedAt: new Date(),
          rawPayload: {
            title: item.title,
            description: item.description,
            link: item.link,
            companyWebsite: audited.extraction?.website_url ?? item.link,
            publishedAt: item.publishedAt.toISOString(),
            extraction: audited.extraction,
          },
        });
        if (!upsert.id) continue;

        const dedupeKey = `${item.companyName}|${item.signalType}`;
        const existingAccepted = runAcceptedByKey.get(dedupeKey) ?? [];
        existingAccepted.push({
          id: upsert.id,
          occurredAt: item.publishedAt,
          summaryText: candidateSummaryText,
          confidence: Number.isFinite(candidateConfidence) ? candidateConfidence : 0,
        });
        runAcceptedByKey.set(dedupeKey, existingAccepted);

        if (upsert.inserted) {
          insertedCount += 1;
          insertedThisSource += 1;
          stageCounters.final_signals_saved += 1;
        }
        if (summarizedCount >= MAX_SUMMARIES_PER_RUN) continue;
        await upsertSignalInsight(upsert.id, {
          summaryShort: item.title,
          actionSuggestion: "",
          reasoning: audited.detail || summarizedDetails(item),
          relevanceScore: Number(audited.extraction?.confidence ?? 0),
          vertical: profile.businessType,
        });
        summarizedCount += 1;
        summarizedThisSource += 1;
        if (insertedCount >= TARGET_QUALITY_INSERTS) break;
      }

      debugLog(
        `org=${organizationId} source=${source.source} fetched=${feedItems.length} keywordPassed=${keywordPassedCount} extractedAccepted=${extractedAcceptedCount} dedupeAllowed=${dedupeAllowedCount} inserted=${insertedThisSource} summarized=${summarizedThisSource} tagFallbackUsed=${tagFallbackUsedCount}`,
      );

      await completeSignalIngestionRun({
        id: runId,
        status: "completed",
        fetchedCount,
        insertedCount,
        summarizedCount,
      });
      if (insertedCount >= TARGET_QUALITY_INSERTS) break;
    } catch (error) {
      await completeSignalIngestionRun({
        id: runId,
        status: "failed",
        fetchedCount,
        insertedCount,
        summarizedCount,
        errorMessage: error instanceof Error ? error.message : "Unknown source error",
      });
    }
  }

  // Fallback mode: if strict filters produced nothing, run a relaxed pass on fetched candidates.
  if (insertedCount === 0 && fallbackCandidates.length > 0) {
    const uniqueCandidates = new Map<string, FeedItem>();
    for (const item of fallbackCandidates) {
      const key = `${item.source}|${item.link}`;
      if (!uniqueCandidates.has(key)) uniqueCandidates.set(key, item);
    }
    const sorted = Array.from(uniqueCandidates.values())
      .filter(item => isRecentEnough(item.publishedAt) && originItemPriority(item) > -1000)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 24);

    for (const item of sorted) {
      item.companyName = normalizeCompanyName(item.companyName);

      if (!passesKeywordFilter(item, profile.selectedSignalTypes ?? [])) {
        continue;
      }
      stageCounters.after_keyword_filter += 1;

      const audited = await extractAndValidateSignal(item, item.companyName, item.title);
      if (audited.classifiedAsSignal) stageCounters.classified_as_signal += 1;
      if (audited.passedExtraction) stageCounters.passed_extraction += 1;
      if (audited.passedValidation) stageCounters.passed_validation += 1;
      if (!audited.accept) continue;
      item.companyName = audited.company;
      item.signalType = audited.signalType;

      const candidateSummaryText =
        audited.extraction?.summary ?? `${audited.company} - ${audited.event}`;
      const candidateConfidence = Number(audited.extraction?.confidence ?? 0);
      const allowed = await maybeDedupeCandidate({
        companyName: item.companyName,
        signalType: item.signalType,
        occurredAt: item.publishedAt,
        summaryText: candidateSummaryText,
        confidence: Number.isFinite(candidateConfidence) ? candidateConfidence : 0,
      });
      if (!allowed) continue;

      const classified = classifyTags(
        item.title,
        item.description,
        profile.selectedTags ?? [],
        item.source,
      );
      const canUseSeedTag =
        item.source.startsWith("google_news_tag_") &&
        item.seedTags.some(tag => (profile.selectedTags ?? []).includes(tag));
      const tags = Array.from(
        new Set([
          ...classified,
          ...(classified.length > 0 || !canUseSeedTag ? [] : item.seedTags),
        ]),
      );
      if ((profile.selectedTags ?? []).length > 0 && tags.length === 0) {
        const fallbackTags =
          item.seedTags.length > 0 ? item.seedTags : (profile.selectedTags ?? []);
        if (fallbackTags.length > 0) tags.push(...fallbackTags);
      }
      logBeforeSavingSignal(item, audited.extraction);
      const upsert = await upsertSignalItem({
        organizationId,
        source: item.source,
        externalId: makeExternalId(item, organizationId),
        signalType: item.signalType,
        companyName: item.companyName,
        headline: item.title,
        url: item.link,
        tags,
        occurredAt: item.publishedAt,
        ingestedAt: new Date(),
        rawPayload: {
          title: item.title,
          description: item.description,
          link: item.link,
          companyWebsite: audited.extraction?.website_url ?? item.link,
          publishedAt: item.publishedAt.toISOString(),
          extraction: audited.extraction,
          fallbackMode: true,
        },
      });
      if (!upsert.id) continue;

      const dedupeKey = `${item.companyName}|${item.signalType}`;
      const existingAccepted = runAcceptedByKey.get(dedupeKey) ?? [];
      existingAccepted.push({
        id: upsert.id,
        occurredAt: item.publishedAt,
        summaryText: candidateSummaryText,
        confidence: Number.isFinite(candidateConfidence) ? candidateConfidence : 0,
      });
      runAcceptedByKey.set(dedupeKey, existingAccepted);

      if (upsert.inserted) {
        insertedCount += 1;
        stageCounters.final_signals_saved += 1;
      }
      if (summarizedCount >= MAX_SUMMARIES_PER_RUN) continue;
      await upsertSignalInsight(upsert.id, {
        summaryShort: item.title,
        actionSuggestion: "",
        reasoning: audited.detail || summarizedDetails(item),
        relevanceScore: Number(audited.extraction?.confidence ?? 0),
        vertical: profile.businessType,
      });
      summarizedCount += 1;
      if (insertedCount >= TARGET_QUALITY_INSERTS) break;
    }
  }

  const stageSummaryLines = [
    `${stageCounters.total_articles} total`,
    `-> ${stageCounters.after_keyword_filter} after keyword filter (-${Math.max(0, stageCounters.total_articles - stageCounters.after_keyword_filter)})`,
    `-> ${stageCounters.classified_as_signal} classified as signal (-${Math.max(0, stageCounters.after_keyword_filter - stageCounters.classified_as_signal)})`,
    `-> ${stageCounters.passed_extraction} passed extraction (-${Math.max(0, stageCounters.classified_as_signal - stageCounters.passed_extraction)})`,
    `-> ${stageCounters.passed_validation} passed validation (-${Math.max(0, stageCounters.passed_extraction - stageCounters.passed_validation)})`,
    `-> ${stageCounters.final_signals_saved} saved (-${Math.max(0, stageCounters.passed_validation - stageCounters.final_signals_saved)})`,
  ];
  debugLog(
    `refresh_summary org=${organizationId}\n${stageSummaryLines.join("\n")}`,
  );

  return { fetchedCount, insertedCount, summarizedCount, stageCounters };
}

export async function runSignalsSchedulerTick() {
  const profiles = await getEnabledSignalProfiles();
  let processedOrganizations = 0;
  let totalInserted = 0;
  for (const profile of profiles) {
    // Global scheduler cadence controls execution frequency (every 30 min).
    const result = await refreshSignalsForOrganization(profile.organizationId);
    processedOrganizations += 1;
    totalInserted += result.insertedCount;
  }
  return { processedOrganizations, totalInserted };
}

export async function getSignalsForOrganization(input: {
  organizationId: number;
  limit?: number;
  offset?: number;
  search?: string;
  source?: string;
  tag?: string;
  signalType?: string;
}) {
  return listSignals(input);
}
