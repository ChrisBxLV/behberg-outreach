export const SIGNAL_TYPES = [
  "funding",
  "new_office",
  "layoffs",
  "acquisition",
  "hiring_spike",
  "leadership_change",
  "partnership",
  "compliance_event",
  "product_launch",
  "expansion",
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
  "Information Technology", "SaaS", "Artificial Intelligence", "Cybersecurity", "Cloud Computing",
  "Semiconductors", "Data Infrastructure", "Developer Tools", "Enterprise Software", "Telecommunications",
  "Retail", "Ecommerce", "Consumer Goods", "Fashion", "Grocery", "Marketplace",
  "iGaming", "Sports Betting", "Casino Tech", "AdTech", "MarTech", "Media",
  "Healthcare", "HealthTech", "Biotech", "Medical Devices", "Pharma", "Digital Health",
  "Fintech", "Insurtech", "Payments", "Lending", "Banking", "Crypto",
  "Manufacturing", "Automotive", "Mobility", "Aerospace", "Defense", "Industrial Automation",
  "Logistics", "Supply Chain", "Freight", "Shipping", "Last Mile", "Warehousing",
  "Real Estate", "PropTech", "Construction", "Hospitality", "Travel", "Aviation",
  "Energy", "Climate Tech", "Utilities", "Oil and Gas", "Renewables", "Solar",
  "Education", "EdTech", "Government", "Public Sector", "Legal", "Compliance",
  "HR Tech", "Recruitment", "Staffing", "Outsourcing", "Consulting", "Professional Services",
] as const;

const ACTION_TEMPLATES: Record<string, Partial<Record<(typeof SIGNAL_TYPES)[number], string>>> = {
  marketing_agency: {
    funding: "Pitch a quick growth sprint.",
    new_office: "Offer a local launch campaign.",
    layoffs: "Offer lean performance marketing.",
    acquisition: "Pitch post-merger brand support.",
  },
  recruitment: {
    funding: "Pitch priority hiring support.",
    hiring_spike: "Offer embedded recruiting help.",
    layoffs: "Offer talent remapping support.",
  },
  legal: {
    acquisition: "Offer transaction legal support.",
    compliance_event: "Offer a compliance audit.",
    new_office: "Offer market-entry legal support.",
    layoffs: "Offer employment-law review.",
  },
  mna_advisory: {
    acquisition: "Offer integration advisory.",
    funding: "Offer buy-side target scouting.",
    expansion: "Offer deal-structure advisory.",
  },
  ecommerce_services: {
    product_launch: "Offer launch funnel optimization.",
    expansion: "Offer localized ecommerce rollout.",
    partnership: "Offer channel growth support.",
  },
  freight_shipping: {
    new_office: "Offer lane and carrier optimization.",
    expansion: "Offer scalable freight planning.",
    compliance_event: "Offer compliance shipping support.",
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
