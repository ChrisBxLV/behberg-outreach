export type DecisionMakerTitleFamily = {
  key: string;
  label: string;
  variants: string[];
};

export const DECISION_MAKER_TITLE_FAMILIES: DecisionMakerTitleFamily[] = [
  {
    key: "chief_executive",
    label: "Executive leadership",
    variants: [
      "ceo",
      "chief executive officer",
      "president",
      "managing director",
      "md",
      "founder",
      "co founder",
      "co-founder",
      "owner",
    ],
  },
  {
    key: "chief_operating",
    label: "Operations",
    variants: [
      "coo",
      "chief operating officer",
      "head of operations",
      "vp operations",
      "vice president operations",
      "director of operations",
      "operations director",
    ],
  },
  {
    key: "chief_financial",
    label: "Finance",
    variants: [
      "cfo",
      "chief financial officer",
      "finance director",
      "vp finance",
      "vice president finance",
      "head of finance",
    ],
  },
  {
    key: "chief_technology",
    label: "Technology",
    variants: [
      "cto",
      "chief technology officer",
      "vp engineering",
      "vice president engineering",
      "head of engineering",
      "engineering director",
      "director of engineering",
    ],
  },
  {
    key: "chief_information",
    label: "IT",
    variants: [
      "cio",
      "chief information officer",
      "it director",
      "director of it",
      "head of it",
      "vp it",
      "vice president it",
    ],
  },
  {
    key: "chief_security",
    label: "Security",
    variants: [
      "ciso",
      "chief information security officer",
      "head of security",
      "security director",
      "director of security",
    ],
  },
  {
    key: "chief_marketing",
    label: "Marketing",
    variants: [
      "cmo",
      "chief marketing officer",
      "vp marketing",
      "vice president marketing",
      "head of marketing",
      "marketing director",
      "director of marketing",
    ],
  },
  {
    key: "chief_revenue",
    label: "Revenue & sales",
    variants: [
      "cro",
      "chief revenue officer",
      "chief commercial officer",
      "cco",
      "vp sales",
      "vice president sales",
      "head of sales",
      "sales director",
      "director of sales",
      "head of business development",
      "director of business development",
    ],
  },
  {
    key: "chief_people",
    label: "People & HR",
    variants: [
      "chro",
      "chief human resources officer",
      "head of people",
      "hr director",
      "vp people",
      "vice president people",
    ],
  },
  {
    key: "chief_product",
    label: "Product",
    variants: [
      "cpo",
      "chief product officer",
      "vp product",
      "vice president product",
      "head of product",
      "product director",
      "director of product",
    ],
  },
  {
    key: "general_management",
    label: "General management",
    variants: [
      "general manager",
      "gm",
      "country manager",
      "regional director",
      "managing partner",
    ],
  },
];

export function normalizeDecisionMakerTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function decisionMakerSynonymsForTitle(titleNeedle: string): string[] {
  const normalized = normalizeDecisionMakerTitle(titleNeedle);
  if (!normalized) return [];

  for (const family of DECISION_MAKER_TITLE_FAMILIES) {
    if (family.variants.includes(normalized)) {
      return Array.from(new Set([normalized, ...family.variants.map(normalizeDecisionMakerTitle)]));
    }
  }
  return [normalized];
}

export function getDecisionMakerAutocompleteTitles(): string[] {
  const curatedOrder = [
    "CEO",
    "Founder",
    "President",
    "Managing Director",
    "COO",
    "CFO",
    "CTO",
    "CIO",
    "CISO",
    "CMO",
    "CRO",
    "CHRO",
    "CPO",
    "VP Sales",
    "VP Marketing",
    "VP Product",
    "VP Engineering",
    "Head of Sales",
    "Head of Marketing",
    "Head of Product",
    "Head of Operations",
    "Director of Sales",
    "Director of Marketing",
    "General Manager",
    "Country Manager",
    "Owner",
  ];
  return curatedOrder;
}

export function getDecisionMakerFamilySummaries(): string[] {
  return DECISION_MAKER_TITLE_FAMILIES.map(
    family => `${family.label}: ${family.variants.slice(0, 3).join(", ")}...`,
  );
}
