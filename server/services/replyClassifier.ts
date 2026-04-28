import { invokeLLM } from "../_core/llm";

export type ReplySentimentLabel = "positive" | "negative" | "neutral" | "unsubscribe_intent" | "unknown";

const UNSUB = /\b(unsubscribe|opt\s*out|remove\s*me|stop\s*email(?:ing)?|don'?t\s*contact|leave\s*me\s*alone|cease|take\s*me\s*off(?:\s*the)?\s*list)\b/i;
const NEG = /\b(not\s*interested|no\s*thank|decline|pass|not\s*now|not\s*at\s*the\s*moment|wrong\s*person|don'?t\s*reach|stop\s*contact|harass|legal|lawsuit)\b/i;
const POS = /\b(yes|interested|sounds?\s*good|let'?s?\s*talk|schedule|call\s*me|book|meeting|work[s]?\s*for\s*us|send\s*(?:it|them|details?|info|information|over)|can\s+you\s+send|could\s+you\s+send)\b/i;
const QUESTION = /\?/;
const POSITIVE_QUESTION_HINT = /\b(pricing|price|cost|demo|details?|info|information|proposal|deck|brochure|availability|timeline|next\s*step|next\s*steps)\b/i;

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function normalizeReplyText(input: string): string {
  const decoded = decodeEntities(input ?? "");
  const deQuoted = decoded
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith(">")) return false;
      if (/^on .+wrote:$/i.test(trimmed)) return false;
      return true;
    })
    .join(" ");
  return deQuoted.replace(/\s+/g, " ").trim();
}

export function classifyReplyWithRules(text: string): ReplySentimentLabel | null {
  const t = normalizeReplyText(text);
  if (!t) return null;
  if (UNSUB.test(t)) return "unsubscribe_intent";
  if (NEG.test(t) && !POS.test(t)) return "negative";
  if (QUESTION.test(t) && POSITIVE_QUESTION_HINT.test(t)) return "positive";
  if (POS.test(t) && !UNSUB.test(t)) return "positive";
  return null;
}

export async function classifyReplyText(text: string): Promise<ReplySentimentLabel> {
  const stripped = normalizeReplyText(text);
  const fromRules = classifyReplyWithRules(stripped);
  if (fromRules) return fromRules;
  if (!stripped) return "unknown";
  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Classify a short email reply to cold outreach. Reply with exactly one word from: positive, negative, neutral, unsubscribe_intent, unknown.
- positive: interest, meeting request, agreement
- negative: clear rejection, not interested, polite decline without opting out
- unsubscribe_intent: ask to be removed, stop emails, do not contact
- neutral: questions only, or unclear
- unknown: if empty or gibberish`,
        },
        { role: "user", content: `Reply text:\n${stripped.slice(0, 3000)}` },
      ],
      maxTokens: 8,
      temperature: 0,
    });
    const raw = res.choices[0]?.message?.content;
    const w = (typeof raw === "string" ? raw : "unknown").trim().toLowerCase();
    if (w.includes("unsubscribe") || w.includes("opt")) return "unsubscribe_intent";
    if (w.startsWith("positive") || w === "positive") return "positive";
    if (w.startsWith("negative") || w === "negative") return "negative";
    if (w.startsWith("neutral") || w === "neutral") return "neutral";
    return "unknown";
  } catch {
    return "unknown";
  }
}
