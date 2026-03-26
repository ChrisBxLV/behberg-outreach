export const SIGNAL_TYPES = [
  "funding",
  "acquisition",
  "hiring_spike",
  "product_launch",
] as const;

export const BUSINESS_TYPES = [
  { value: "marketing_agency", label: "Marketing agency" },
  { value: "recruitment", label: "Recruitment" },
  { value: "legal", label: "Legal services" },
  { value: "mna_advisory", label: "M&A advisory" },
  { value: "ecommerce_services", label: "Ecommerce services" },
  { value: "freight_shipping", label: "Freight and shipping" },
  { value: "fintech_services", label: "Fintech services" },
  { value: "it_services", label: "IT services" },
  { value: "consulting", label: "Consulting" },
  { value: "other", label: "Other" },
] as const;

export const INDUSTRY_TAGS = [
  "Technology & AI",
  "Fintech & Payments",
  "Ecommerce & Retail",
  "iGaming & Casino Tech",
  "Healthcare & Biotech",
  "Logistics & Supply Chain",
  "Public Sector",
  "Legal & Compliance",
] as const;

const ACTION_TEMPLATES: Record<string, Partial<Record<(typeof SIGNAL_TYPES)[number], string>>> = {
  marketing_agency: {
    funding: "Pitch a quick growth sprint.",
    acquisition: "Pitch post-merger brand support.",
  },
  recruitment: {
    funding: "Pitch priority hiring support.",
    hiring_spike: "Offer embedded recruiting help.",
  },
  legal: {
    acquisition: "Offer transaction legal support.",
  },
  mna_advisory: {
    acquisition: "Offer integration advisory.",
    funding: "Offer buy-side target scouting.",
  },
  ecommerce_services: {
    product_launch: "Offer launch funnel optimization.",
  },
  freight_shipping: {
    // No specific templates for the current signal types yet.
  },
};

export function actionableSuggestion(
  businessType: string,
  signalType: (typeof SIGNAL_TYPES)[number],
): string {
  const specific = ACTION_TEMPLATES[businessType]?.[signalType];
  if (specific) return specific;
  return "Send a short, context-specific pitch.";
}
