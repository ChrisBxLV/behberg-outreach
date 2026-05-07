// Static industry taxonomy used by the prospect database. Stored in MySQL via
// `industries` so we can FK from prospect_companies but driven from this list.
//
// Top-level codes are intentionally short and broad. Sub-industries map to
// real-world signals that the deterministic classifier and signal pipeline can
// detect from a company name + meta description.

export type IndustryNode = {
  code: string;
  label: string;
  /** Keywords used by `industryClassifier` to match a company. Lowercase. */
  keywords: string[];
  /** Sub-industries (depth = 1). */
  children?: IndustryNode[];
};

export const INDUSTRY_TAXONOMY: IndustryNode[] = [
  {
    code: "it_software",
    label: "IT & Software",
    keywords: [
      "software",
      "saas",
      "platform",
      "cloud",
      "developer",
      "ai",
      "artificial intelligence",
      "machine learning",
      "ml",
      "llm",
      "data platform",
      "analytics",
      "cybersecurity",
      "infosec",
      "security",
      "devops",
      "hosting",
      "infrastructure",
      "iot",
      "blockchain",
      "no-code",
      "low-code",
    ],
    children: [
      { code: "saas", label: "SaaS", keywords: ["saas", "subscription software", "b2b software"] },
      { code: "ai_ml", label: "AI & ML", keywords: ["ai", "machine learning", "ml", "llm", "generative ai", "computer vision"] },
      { code: "cybersecurity", label: "Cybersecurity", keywords: ["cybersecurity", "infosec", "security", "siem", "soar", "edr", "xdr", "threat", "firewall"] },
      { code: "devtools_cloud", label: "DevTools & Cloud", keywords: ["devops", "devtools", "ci/cd", "cloud platform", "kubernetes", "container", "iac"] },
      { code: "data_analytics", label: "Data & Analytics", keywords: ["data platform", "analytics", "business intelligence", "bi", "data warehouse", "etl", "elt"] },
      { code: "fintech_software", label: "Fintech Software", keywords: ["fintech", "payments software", "core banking", "ledger", "kyc"] },
      { code: "hosting_infra", label: "Hosting & Infrastructure", keywords: ["hosting", "managed service provider", "msp", "data center", "colo"] },
      { code: "blockchain_web3", label: "Blockchain & Web3", keywords: ["blockchain", "web3", "crypto exchange", "defi", "nft"] },
    ],
  },
  {
    code: "engineering",
    label: "Engineering",
    keywords: [
      "engineering",
      "mechanical",
      "electrical",
      "civil",
      "aerospace",
      "automotive",
      "robotics",
      "construction",
      "industrial design",
      "hardware",
      "manufacturing",
      "fabrication",
    ],
    children: [
      { code: "mechanical_engineering", label: "Mechanical Engineering", keywords: ["mechanical engineering", "machinery", "machine design"] },
      { code: "electrical_engineering", label: "Electrical Engineering", keywords: ["electrical engineering", "power electronics", "circuits"] },
      { code: "civil_engineering", label: "Civil Engineering", keywords: ["civil engineering", "structural engineering", "infrastructure"] },
      { code: "aerospace", label: "Aerospace & Defense", keywords: ["aerospace", "defense", "aviation", "satellite", "drone"] },
      { code: "automotive", label: "Automotive", keywords: ["automotive", "auto parts", "ev", "electric vehicle", "automaker"] },
      { code: "construction_arch", label: "Construction & Architecture", keywords: ["construction", "architecture", "building", "general contractor"] },
      { code: "hardware_electronics", label: "Hardware & Electronics", keywords: ["hardware", "electronics", "semiconductor", "chip", "embedded"] },
      { code: "robotics_automation", label: "Robotics & Automation", keywords: ["robotics", "automation", "industrial automation", "plc"] },
    ],
  },
  {
    code: "finance",
    label: "Banking & Financial Services",
    keywords: [
      "bank",
      "banking",
      "investment",
      "asset management",
      "private equity",
      "venture capital",
      "vc",
      "private credit",
      "hedge fund",
      "broker",
      "wealth",
      "insurance",
      "reinsurance",
      "consulting",
      "accounting",
      "audit",
      "tax",
      "advisory",
      "m&a",
      "mergers and acquisitions",
      "capital markets",
    ],
    children: [
      { code: "banking", label: "Banking", keywords: ["bank", "retail bank", "commercial bank", "neobank"] },
      { code: "investment_banking", label: "Investment Banking", keywords: ["investment banking", "ib", "capital markets", "equity research"] },
      { code: "asset_management", label: "Asset Management", keywords: ["asset management", "fund management", "mutual fund", "etf"] },
      { code: "private_equity", label: "Private Equity", keywords: ["private equity", "pe firm", "buyout"] },
      { code: "venture_capital", label: "Venture Capital", keywords: ["venture capital", "vc", "early stage", "growth equity", "seed fund"] },
      { code: "m_and_a", label: "M&A Advisory", keywords: ["m&a", "mergers and acquisitions", "advisory firm", "corporate finance"] },
      { code: "insurance", label: "Insurance", keywords: ["insurance", "insurer", "underwriter", "reinsurance", "insurtech"] },
      { code: "consulting", label: "Consulting", keywords: ["consulting", "consultancy", "management consulting", "strategy consulting"] },
      { code: "accounting", label: "Accounting & Tax", keywords: ["accounting", "audit", "tax advisory", "cpa firm"] },
      { code: "wealth_management", label: "Wealth Management", keywords: ["wealth management", "private banking", "family office", "rias"] },
      { code: "fintech", label: "Fintech", keywords: ["fintech", "neobank", "digital bank", "payments", "lending tech"] },
    ],
  },
  {
    code: "healthcare",
    label: "Healthcare & Life Sciences",
    keywords: [
      "healthcare",
      "health",
      "hospital",
      "clinic",
      "pharma",
      "biotech",
      "medtech",
      "medical device",
      "digital health",
      "diagnostics",
      "telehealth",
      "life sciences",
    ],
    children: [
      { code: "pharma", label: "Pharmaceuticals", keywords: ["pharmaceutical", "pharma"] },
      { code: "biotech", label: "Biotechnology", keywords: ["biotech", "biotechnology", "genomics"] },
      { code: "medtech", label: "Medical Devices", keywords: ["medical device", "medtech", "diagnostics"] },
      { code: "healthcare_services", label: "Healthcare Services", keywords: ["hospital", "clinic", "healthcare provider", "primary care"] },
      { code: "digital_health", label: "Digital Health", keywords: ["digital health", "telehealth", "telemedicine", "health app"] },
    ],
  },
  {
    code: "manufacturing",
    label: "Manufacturing",
    keywords: ["manufacturing", "industrial", "factory", "fabrication", "machining", "cpg", "consumer packaged goods"],
    children: [
      { code: "industrial_manufacturing", label: "Industrial Manufacturing", keywords: ["industrial", "factory", "fabrication"] },
      { code: "cpg", label: "Consumer Packaged Goods", keywords: ["cpg", "consumer packaged goods", "fmcg"] },
      { code: "chemicals", label: "Chemicals", keywords: ["chemicals", "specialty chemicals", "polymer"] },
    ],
  },
  {
    code: "retail_ecom",
    label: "Retail & Ecommerce",
    keywords: ["retail", "ecommerce", "marketplace", "dtc", "fashion", "grocery", "wholesale", "luxury"],
    children: [
      { code: "ecommerce", label: "Ecommerce", keywords: ["ecommerce", "online store", "dtc", "shopify"] },
      { code: "retail", label: "Retail", keywords: ["retail", "store", "brick and mortar"] },
      { code: "marketplace", label: "Marketplace", keywords: ["marketplace", "two-sided platform"] },
      { code: "fashion_luxury", label: "Fashion & Luxury", keywords: ["fashion", "luxury", "apparel"] },
    ],
  },
  {
    code: "media_entertainment",
    label: "Media & Entertainment",
    keywords: ["media", "publishing", "newspaper", "magazine", "tv", "studio", "music", "gaming", "esports", "streaming"],
    children: [
      { code: "publishing", label: "Publishing", keywords: ["publishing", "magazine", "newspaper", "content"] },
      { code: "gaming", label: "Gaming", keywords: ["gaming", "game studio", "esports", "videogame"] },
      { code: "music_film", label: "Music & Film", keywords: ["music label", "film studio", "production studio"] },
      { code: "streaming", label: "Streaming", keywords: ["streaming", "ott", "vod"] },
    ],
  },
  {
    code: "professional_services",
    label: "Professional Services",
    keywords: ["legal", "law firm", "hr", "marketing", "advertising", "agency", "pr", "recruiting", "real estate", "architecture", "design"],
    children: [
      { code: "legal", label: "Legal", keywords: ["law firm", "attorney", "legal", "barrister"] },
      { code: "hr_recruiting", label: "HR & Recruiting", keywords: ["recruiting", "staffing", "talent agency", "hr consulting"] },
      { code: "marketing_advertising", label: "Marketing & Advertising", keywords: ["marketing agency", "advertising", "ad agency", "creative agency"] },
      { code: "pr", label: "Public Relations", keywords: ["public relations", "pr agency", "communications agency"] },
      { code: "real_estate", label: "Real Estate", keywords: ["real estate", "property management", "broker", "reit"] },
      { code: "architecture_design", label: "Architecture & Design", keywords: ["architecture", "design studio", "interior design"] },
    ],
  },
  {
    code: "education",
    label: "Education",
    keywords: ["education", "edtech", "university", "college", "school", "training", "learning", "bootcamp"],
    children: [
      { code: "edtech", label: "Edtech", keywords: ["edtech", "online learning", "lms"] },
      { code: "higher_ed", label: "Higher Education", keywords: ["university", "college"] },
      { code: "k12", label: "K-12", keywords: ["k-12", "primary school", "secondary school"] },
      { code: "training", label: "Training & Bootcamps", keywords: ["bootcamp", "professional training", "coding school"] },
    ],
  },
  {
    code: "transport_logistics",
    label: "Transportation & Logistics",
    keywords: ["logistics", "shipping", "freight", "transport", "transportation", "aviation", "mobility", "fleet", "last mile", "ocean freight"],
    children: [
      { code: "logistics", label: "Logistics", keywords: ["logistics", "supply chain", "warehouse", "3pl"] },
      { code: "shipping_freight", label: "Shipping & Freight", keywords: ["shipping", "freight", "ocean freight"] },
      { code: "aviation", label: "Aviation", keywords: ["aviation", "airline"] },
      { code: "mobility", label: "Mobility", keywords: ["mobility", "ride hailing", "scooter"] },
    ],
  },
  {
    code: "energy_utilities",
    label: "Energy & Utilities",
    keywords: ["energy", "oil", "gas", "renewables", "solar", "wind", "utility", "utilities", "power", "mining"],
    children: [
      { code: "renewables", label: "Renewables", keywords: ["renewables", "solar", "wind", "geothermal"] },
      { code: "oil_gas", label: "Oil & Gas", keywords: ["oil and gas", "upstream", "downstream", "refinery"] },
      { code: "utilities", label: "Utilities", keywords: ["utility", "utilities", "grid"] },
      { code: "mining", label: "Mining", keywords: ["mining", "minerals", "metals"] },
    ],
  },
  {
    code: "public_sector",
    label: "Public Sector & Nonprofit",
    keywords: ["government", "public sector", "agency", "ngo", "non-profit", "nonprofit", "charity", "foundation"],
    children: [
      { code: "government", label: "Government", keywords: ["government", "ministry", "department of"] },
      { code: "ngo_nonprofit", label: "NGO / Nonprofit", keywords: ["ngo", "nonprofit", "non-profit", "charity", "foundation"] },
    ],
  },
  {
    code: "agriculture_food",
    label: "Agriculture, Food & Hospitality",
    keywords: ["agriculture", "food", "beverage", "restaurant", "hospitality", "hotel", "agtech", "farming"],
    children: [
      { code: "agtech", label: "Agtech", keywords: ["agtech", "agriculture technology", "precision farming"] },
      { code: "food_beverage", label: "Food & Beverage", keywords: ["food and beverage", "f&b", "beverage"] },
      { code: "hospitality", label: "Hospitality", keywords: ["hospitality", "hotel", "restaurant chain"] },
    ],
  },
];

/** Flattens taxonomy to (code, label, parentCode) rows for DB seed. */
export function flattenIndustriesForDb(): Array<{ code: string; label: string; parentCode: string | null }> {
  const out: Array<{ code: string; label: string; parentCode: string | null }> = [];
  for (const top of INDUSTRY_TAXONOMY) {
    out.push({ code: top.code, label: top.label, parentCode: null });
    for (const child of top.children ?? []) {
      out.push({ code: child.code, label: child.label, parentCode: top.code });
    }
  }
  return out;
}

/** Lookup helper used by classifier and search. */
export function findIndustryByCode(code: string): IndustryNode | null {
  for (const top of INDUSTRY_TAXONOMY) {
    if (top.code === code) return top;
    for (const child of top.children ?? []) {
      if (child.code === code) return child;
    }
  }
  return null;
}
