// Deterministic industry classifier.
//
// Walks the static industry taxonomy and scores each top-level + sub-industry
// against the input text. Highest-scoring top-level is returned. Sub-industry
// is returned when it scores at least one keyword hit on its own.

import { INDUSTRY_TAXONOMY, type IndustryNode } from "./industryTaxonomy";

export type IndustryClassification = {
  code: string | null;
  subCode: string | null;
};

export type ClassifierInput = {
  name?: string | null;
  websiteMeta?: string | null;
  websiteTitle?: string | null;
  linkedinAbout?: string | null;
};

const STOPWORD_BOOSTS: Record<string, string> = {
  // Common false-positives we want to neutralize.
  "vc fund": "venture_capital",
};

export function classifyIndustry(input: ClassifierInput): IndustryClassification {
  const haystack = [
    input.name ?? "",
    input.websiteTitle ?? "",
    input.websiteMeta ?? "",
    input.linkedinAbout ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return { code: null, subCode: null };

  let bestTop: { node: IndustryNode; score: number } | null = null;
  const subScores = new Map<string, { node: IndustryNode; score: number }>();

  for (const top of INDUSTRY_TAXONOMY) {
    const topScore = scoreNode(top, haystack);
    let topAggregate = topScore;
    for (const child of top.children ?? []) {
      const childScore = scoreNode(child, haystack);
      if (childScore > 0) {
        topAggregate += childScore;
        const prev = subScores.get(top.code);
        if (!prev || prev.score < childScore) {
          subScores.set(top.code, { node: child, score: childScore });
        }
      }
    }
    if (topAggregate > 0 && (!bestTop || topAggregate > bestTop.score)) {
      bestTop = { node: top, score: topAggregate };
    }
  }

  // Apply stopword nudges.
  for (const [phrase, code] of Object.entries(STOPWORD_BOOSTS)) {
    if (haystack.includes(phrase)) {
      for (const top of INDUSTRY_TAXONOMY) {
        for (const child of top.children ?? []) {
          if (child.code === code) {
            bestTop = { node: top, score: (bestTop?.score ?? 0) + 2 };
            subScores.set(top.code, { node: child, score: (subScores.get(top.code)?.score ?? 0) + 2 });
          }
        }
      }
    }
  }

  if (!bestTop) return { code: null, subCode: null };
  const sub = subScores.get(bestTop.node.code);
  return {
    code: bestTop.node.code,
    subCode: sub?.node.code ?? null,
  };
}

function scoreNode(node: IndustryNode, haystack: string): number {
  let score = 0;
  for (const keyword of node.keywords) {
    if (!keyword) continue;
    const k = keyword.toLowerCase();
    if (haystack.includes(k)) {
      // Multi-word matches weigh more.
      score += k.includes(" ") ? 2 : 1;
    }
  }
  return score;
}
