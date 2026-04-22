import { invokeLLM } from "../_core/llm";

export type ReplySentimentLabel = "positive" | "negative" | "neutral" | "unsubscribe_intent" | "unknown";

const UNSUB = /\b(unsubscribe|opt\s*out|remove\s*me|stop\s*email|don'?t\s*contact|leave\s*me\s*alone|not\s*interested|no\s*thanks|cease|take\s*me\s*off)\b/i;
const NEG = /\b(not\s*interested|no\s*thank|decline|pass|not\s*now|wrong\s*person|don'?t\s*reach|fuck|stop\s*contact|harass|legal|lawsuit)\b/i;
const POS = /\b(yes|interested|sounds?\s*good|let'?s?\s*talk|schedule|call\s*me|book|meeting|work[s]?\s*for\s*us|re\s*:\s*)/i;

export function classifyReplyWithRules(text: string): ReplySentimentLabel | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (UNSUB.test(t)) return "unsubscribe_intent";
  if (NEG.test(t) && !POS.test(t)) return "negative";
  if (POS.test(t) && !UNSUB.test(t)) return "positive";
  return null;
}

export async function classifyReplyText(text: string): Promise<ReplySentimentLabel> {
  const stripped = (text ?? "").trim();
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
