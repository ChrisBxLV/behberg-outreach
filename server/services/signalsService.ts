import { createHash } from "node:crypto";
import { invokeLLM } from "../_core/llm";
import {
  completeSignalIngestionRun,
  createSignalIngestionRun,
  getEnabledSignalProfiles,
  getSignalProfile,
  listSignals,
  upsertSignalInsight,
  upsertSignalItem,
} from "../db";
import { SIGNAL_TYPES, actionableSuggestion } from "./signalsCatalog";

type FeedItem = {
  source: string;
  title: string;
  description: string;
  link: string;
  publishedAt: Date;
  companyName: string;
  signalType: (typeof SIGNAL_TYPES)[number];
  tags: string[];
  seedTags: string[];
};

const SIGNAL_SOURCE_URLS = [
  {
    source: "google_news_business",
    url: "https://news.google.com/rss/search?q=(funding%20OR%20acquired%20OR%20layoffs%20OR%20opens%20office)&hl=en-US&gl=US&ceid=US:en",
  },
  {
    source: "google_news_technology",
    url: "https://news.google.com/rss/search?q=(technology%20company%20funding%20OR%20product%20launch)&hl=en-US&gl=US&ceid=US:en",
  },
  { source: "techcrunch", url: "https://techcrunch.com/feed/" },
  { source: "venturebeat", url: "https://venturebeat.com/category/business/feed/" },
  { source: "businesswire", url: "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFJXWA==" },
  { source: "reuters_business", url: "https://feeds.reuters.com/reuters/businessNews" },
  // HN frontpage frequently yields discussion-style titles instead of company events.
] as const;

const SOURCE_FETCH_LIMIT = 3;
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
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "Information Technology": ["software", "technology", "it ", "cloud", "developer", "saas"],
  "Artificial Intelligence": ["ai ", "artificial intelligence", "machine learning", "llm"],
  "Data Infrastructure": ["data platform", "database", "warehouse", "infrastructure"],
  "Enterprise Software": ["enterprise", "b2b software", "platform"],
  Ecommerce: ["ecommerce", "online store", "retail media", "marketplace"],
  Fintech: ["fintech", "payments", "bank", "credit", "finance"],
  "Casino Tech": ["igaming", "casino", "sportsbook", "betting"],
  Government: ["county", "city", "state", "sheriff", "public sector", "department"],
  "Public Sector": ["public sector", "government", "municipal", "agency"],
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
  techcrunch: ["Information Technology", "Artificial Intelligence", "Enterprise Software", "SaaS"],
  venturebeat: ["Information Technology", "Artificial Intelligence", "Data Infrastructure", "Enterprise Software"],
  ycombinator_hn: ["Information Technology", "Artificial Intelligence", "SaaS"],
  google_news_technology: ["Information Technology", "Artificial Intelligence"],
};
const headlineAuditCache = new Map<
  string,
  { accept: boolean; company: string; event: string; detail: string }
>();

function inferSignalType(title: string): (typeof SIGNAL_TYPES)[number] {
  const t = title.toLowerCase();
  if (t.includes("acquire") || t.includes("acquisition") || t.includes("merger")) return "acquisition";
  if (t.includes("layoff") || t.includes("job cut") || t.includes("restructur")) return "layoffs";
  if (t.includes("funding") || t.includes("raises") || t.includes("series ")) return "funding";
  if (t.includes("new office") || t.includes("opens") || t.includes("headquarters")) return "new_office";
  if (t.includes("partnership") || t.includes("partners with")) return "partnership";
  if (t.includes("compliance") || t.includes("regulatory") || t.includes("investigation")) {
    return "compliance_event";
  }
  if (t.includes("launch") || t.includes("introduces") || t.includes("unveils")) return "product_launch";
  if (t.includes("hiring") || t.includes("hiring spree")) return "hiring_spike";
  if (t.includes("appoints") || t.includes("new ceo") || t.includes("chief")) return "leadership_change";
  return "expansion";
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

function buildTagSpecificSources(selectedTags: string[]) {
  const limited = selectedTags.slice(0, 6);
  return limited.map(tag => ({
    source: `google_news_tag_${tag.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${tag} company funding OR acquisition OR expansion OR layoffs OR partnership`)}&hl=en-US&gl=US&ceid=US:en`,
    seedTag: tag,
  }));
}

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
    .replace(/\/?font[^ ]*/gi, " ")
    .replace(/\/?a[^ ]*/gi, " ")
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
  const acceptableType = item.signalType !== "expansion";
  return {
    score: clamped,
    direct: clamped >= threshold && (hasDirect || acceptableType),
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
    case "new_office":
      return "opens a new office";
    case "layoffs":
      return "announces layoffs";
    case "acquisition":
      return "announces an acquisition";
    case "hiring_spike":
      return "shows a hiring spike";
    case "leadership_change":
      return "announces a leadership change";
    case "partnership":
      return "announces a partnership";
    case "compliance_event":
      return "faces a compliance event";
    case "product_launch":
      return "launches a product";
    default:
      return "announces expansion";
  }
}

function cleanUrlText(input: string): string {
  return stripHtml(input)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bhref\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\btarget\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\b(?:beh|tourn|se)\b/gi, " ")
    .replace(/\b(?:ne)\s+\$(\d)/gi, "$$$1")
    .replace(/\b(he|ne)\b/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function localQualityAudit(item: FeedItem, company: string, event: string, detail: string) {
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
    shouldIgnoreSignal({ ...item, companyName: normalizedCompany, title: `${normalizedCompany} - ${normalizedEvent}` }) ||
    /\b(url:\s*comments?|points?:\s*\d+)\b/i.test(combined);
  return { accept: !bad, company: normalizedCompany, event: normalizedEvent, detail: normalizedDetail };
}

async function auditCompanyEventWithLLM(item: FeedItem, company: string, event: string) {
  const key = `${item.title}|||${item.description}`.slice(0, 400);
  const cached = headlineAuditCache.get(key);
  if (cached) return cached;
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Rewrite and verify business signal text. Return ONLY JSON. Keep company name clean and event understandable. Reject gibberish, policy/geopolitical notices, forum/comment noise.",
        },
        {
          role: "user",
          content: `Source title: ${item.title}\nSource description: ${item.description}\nDraft company: ${company}\nDraft event: ${event}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "signal_quality_rewrite",
          strict: true,
          schema: {
            type: "object",
            properties: {
              accept: { type: "boolean" },
              company: { type: "string" },
              event: { type: "string" },
              detail: { type: "string" },
            },
            required: ["accept", "company", "event", "detail"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}") as {
      accept?: boolean;
      company?: string;
      event?: string;
      detail?: string;
    };
    const reviewed = localQualityAudit(
      item,
      parsed.company ?? company,
      parsed.event ?? event,
      parsed.detail ?? item.description,
    );
    const result = {
      ...reviewed,
      accept: Boolean(parsed.accept) && reviewed.accept,
    };
    headlineAuditCache.set(key, result);
    return result;
  } catch {
    const fallback = localQualityAudit(item, company, event, item.description || item.title);
    headlineAuditCache.set(key, fallback);
    return fallback;
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
      const description = stripHtml(raw.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
      const link = (raw.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const pubDate = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
      const publishedAt = pubDate ? new Date(pubDate) : new Date();
      const cleanTitle = stripHtml(title);
      const companyName = inferCompanyName(cleanTitle);
      const signalType = inferSignalType(cleanTitle);
      return {
        source,
        title: cleanTitle,
        description,
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
  const profile = await getSignalProfile(organizationId);
  if (!profile?.isEnabled) {
    return { fetchedCount: 0, insertedCount: 0, summarizedCount: 0 };
  }

  const selectedSources =
    profile.sourcesEnabled?.length
      ? SIGNAL_SOURCE_URLS.filter(source => profile.sourcesEnabled.includes(source.source))
      : SIGNAL_SOURCE_URLS;
  const itOnlySelection =
    (profile.selectedTags ?? []).length > 0 &&
    (profile.selectedTags ?? []).every(
      tag =>
        tag === "Information Technology" ||
        tag === "Artificial Intelligence" ||
        tag === "Data Infrastructure" ||
        tag === "Enterprise Software" ||
        tag === "SaaS",
    );
  const sourceBase = itOnlySelection
    ? selectedSources.filter(
        source =>
          source.source !== "google_news_business" &&
          source.source !== "reuters_business",
      )
    : selectedSources;
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
      const cappedItems = feedItems.slice(0, MAX_INSERTS_PER_RUN - insertedCount);

      for (const item of cappedItems) {
        if (!isRecentEnough(item.publishedAt)) continue;
        fallbackCandidates.push(item);
        item.companyName = normalizeCompanyName(item.companyName);
        if (shouldIgnoreSignal(item)) continue;
        const repaired = repairTitleEventStructure(item);
        if (!repaired.ok) continue;
        const audited = await auditCompanyEventWithLLM(item, repaired.company, repaired.event);
        if (!audited.accept) continue;
        item.companyName = repaired.company;
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
        if ((profile.selectedTags ?? []).length > 0 && tags.length === 0) continue;
        const reevaluation = reEvaluateSignalCandidate(item, profile.selectedTags ?? []);
        if (!reevaluation.accepted) continue;
        if (
          (profile.selectedSignalTypes ?? []).length > 0 &&
          !profile.selectedSignalTypes?.includes(item.signalType)
        ) {
          continue;
        }
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
            companyWebsite: await resolveCompanyWebsite(item.companyName, item.link),
            publishedAt: item.publishedAt.toISOString(),
          },
        });
        if (!upsert.id) continue;
        if (upsert.inserted) insertedCount += 1;
        if (summarizedCount >= MAX_SUMMARIES_PER_RUN) continue;
        const shortAction = actionableSuggestion(profile.businessType, item.signalType).slice(0, 90);
        await upsertSignalInsight(upsert.id, {
          summaryShort: `${audited.company} - ${audited.event}`,
          actionSuggestion: shortAction,
          reasoning: audited.detail || summarizedDetails(item),
          relevanceScore: reevaluation.score,
          vertical: profile.businessType,
        });
        summarizedCount += 1;
        if (insertedCount >= TARGET_QUALITY_INSERTS) break;
      }

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
      .filter(item => isRecentEnough(item.publishedAt))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 24);

    for (const item of sorted) {
      item.companyName = normalizeCompanyName(item.companyName);
      if (ENTITY_BLOCKLIST.some(term => `${item.companyName} ${item.title}`.toLowerCase().includes(term))) {
        continue;
      }
      const repaired = repairTitleEventStructure(item);
      if (!repaired.ok) continue;
      const audited = await auditCompanyEventWithLLM(item, repaired.company, repaired.event);
      if (!audited.accept) continue;

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
      if ((profile.selectedTags ?? []).length > 0 && tags.length === 0) continue;
      if (
        (profile.selectedSignalTypes ?? []).length > 0 &&
        !profile.selectedSignalTypes.includes(item.signalType)
      ) {
        continue;
      }

      const upsert = await upsertSignalItem({
        organizationId,
        source: item.source,
        externalId: makeExternalId(item, organizationId),
        signalType: item.signalType,
        companyName: repaired.company,
        headline: item.title,
        url: item.link,
        tags,
        occurredAt: item.publishedAt,
        ingestedAt: new Date(),
        rawPayload: {
          title: item.title,
          description: item.description,
          link: item.link,
          companyWebsite: await resolveCompanyWebsite(repaired.company, item.link),
          publishedAt: item.publishedAt.toISOString(),
          fallbackMode: true,
        },
      });
      if (!upsert.id) continue;
      if (upsert.inserted) insertedCount += 1;
      if (summarizedCount >= MAX_SUMMARIES_PER_RUN) continue;
      const shortAction = actionableSuggestion(profile.businessType, item.signalType).slice(0, 90);
      await upsertSignalInsight(upsert.id, {
        summaryShort: `${audited.company} - ${audited.event}`,
        actionSuggestion: shortAction,
        reasoning: audited.detail || summarizedDetails(item),
        relevanceScore: 0.4,
        vertical: profile.businessType,
      });
      summarizedCount += 1;
      if (insertedCount >= TARGET_QUALITY_INSERTS) break;
    }
  }

  return { fetchedCount, insertedCount, summarizedCount };
}

export async function runSignalsSchedulerTick() {
  const profiles = await getEnabledSignalProfiles();
  let processedOrganizations = 0;
  let totalInserted = 0;
  for (const profile of profiles) {
    const cadenceMinutes = profile.refreshCadenceMinutes ?? 30;
    const minutesSinceUpdate = Math.floor(
      (Date.now() - new Date(profile.updatedAt).getTime()) / (60 * 1000),
    );
    if (minutesSinceUpdate < Math.max(5, cadenceMinutes)) continue;
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
