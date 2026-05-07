// Regions used to fan out crawl seeds across countries / US states. Codes
// follow ISO-3166-1 alpha-2 for countries and ISO-3166-2:US for US states.
//
// `searchHint` is appended to LinkedIn SERP queries and Wikidata SPARQL
// filters so the same crawler shape works across regions.

export type RegionSeed = {
  /** Stable identifier used in `prospect_crawl_seeds.region`. */
  code: string;
  label: string;
  /** ISO-3166 alpha-2 country code. For US states, this is "US". */
  country: string;
  /** ISO-3166-2 admin-1 (state/province) code, when applicable. */
  admin1?: string;
  /** Free-text hint appended to SERP queries. */
  searchHint: string;
  /** Optional Wikidata QID used for region SPARQL filters. */
  wikidataQid?: string;
};

const US_STATES: Array<{ code: string; label: string; qid: string }> = [
  { code: "AL", label: "Alabama", qid: "Q173" },
  { code: "AK", label: "Alaska", qid: "Q797" },
  { code: "AZ", label: "Arizona", qid: "Q816" },
  { code: "AR", label: "Arkansas", qid: "Q1612" },
  { code: "CA", label: "California", qid: "Q99" },
  { code: "CO", label: "Colorado", qid: "Q1261" },
  { code: "CT", label: "Connecticut", qid: "Q779" },
  { code: "DE", label: "Delaware", qid: "Q1393" },
  { code: "DC", label: "District of Columbia", qid: "Q3551781" },
  { code: "FL", label: "Florida", qid: "Q812" },
  { code: "GA", label: "Georgia", qid: "Q1428" },
  { code: "HI", label: "Hawaii", qid: "Q782" },
  { code: "ID", label: "Idaho", qid: "Q1221" },
  { code: "IL", label: "Illinois", qid: "Q1204" },
  { code: "IN", label: "Indiana", qid: "Q1415" },
  { code: "IA", label: "Iowa", qid: "Q1546" },
  { code: "KS", label: "Kansas", qid: "Q1558" },
  { code: "KY", label: "Kentucky", qid: "Q1603" },
  { code: "LA", label: "Louisiana", qid: "Q1588" },
  { code: "ME", label: "Maine", qid: "Q724" },
  { code: "MD", label: "Maryland", qid: "Q1391" },
  { code: "MA", label: "Massachusetts", qid: "Q771" },
  { code: "MI", label: "Michigan", qid: "Q1166" },
  { code: "MN", label: "Minnesota", qid: "Q1527" },
  { code: "MS", label: "Mississippi", qid: "Q1494" },
  { code: "MO", label: "Missouri", qid: "Q1581" },
  { code: "MT", label: "Montana", qid: "Q1212" },
  { code: "NE", label: "Nebraska", qid: "Q1553" },
  { code: "NV", label: "Nevada", qid: "Q1227" },
  { code: "NH", label: "New Hampshire", qid: "Q759" },
  { code: "NJ", label: "New Jersey", qid: "Q1408" },
  { code: "NM", label: "New Mexico", qid: "Q1522" },
  { code: "NY", label: "New York", qid: "Q1384" },
  { code: "NC", label: "North Carolina", qid: "Q1454" },
  { code: "ND", label: "North Dakota", qid: "Q1207" },
  { code: "OH", label: "Ohio", qid: "Q1397" },
  { code: "OK", label: "Oklahoma", qid: "Q1649" },
  { code: "OR", label: "Oregon", qid: "Q824" },
  { code: "PA", label: "Pennsylvania", qid: "Q1400" },
  { code: "RI", label: "Rhode Island", qid: "Q1387" },
  { code: "SC", label: "South Carolina", qid: "Q1456" },
  { code: "SD", label: "South Dakota", qid: "Q1211" },
  { code: "TN", label: "Tennessee", qid: "Q1509" },
  { code: "TX", label: "Texas", qid: "Q1439" },
  { code: "UT", label: "Utah", qid: "Q829" },
  { code: "VT", label: "Vermont", qid: "Q16551" },
  { code: "VA", label: "Virginia", qid: "Q1370" },
  { code: "WA", label: "Washington", qid: "Q1223" },
  { code: "WV", label: "West Virginia", qid: "Q1371" },
  { code: "WI", label: "Wisconsin", qid: "Q1537" },
  { code: "WY", label: "Wyoming", qid: "Q1214" },
];

const CANADIAN_PROVINCES: Array<{ code: string; label: string; qid: string }> = [
  { code: "AB", label: "Alberta", qid: "Q1951" },
  { code: "BC", label: "British Columbia", qid: "Q1974" },
  { code: "MB", label: "Manitoba", qid: "Q1948" },
  { code: "NB", label: "New Brunswick", qid: "Q1965" },
  { code: "NL", label: "Newfoundland and Labrador", qid: "Q1969" },
  { code: "NS", label: "Nova Scotia", qid: "Q1952" },
  { code: "ON", label: "Ontario", qid: "Q1904" },
  { code: "PE", label: "Prince Edward Island", qid: "Q1965" },
  { code: "QC", label: "Quebec", qid: "Q176" },
  { code: "SK", label: "Saskatchewan", qid: "Q1989" },
  { code: "NT", label: "Northwest Territories", qid: "Q2007" },
  { code: "NU", label: "Nunavut", qid: "Q1970" },
  { code: "YT", label: "Yukon", qid: "Q2009" },
];

const EUROPE: Array<{ code: string; label: string; qid: string }> = [
  { code: "GB", label: "United Kingdom", qid: "Q145" },
  { code: "DE", label: "Germany", qid: "Q183" },
  { code: "FR", label: "France", qid: "Q142" },
  { code: "IT", label: "Italy", qid: "Q38" },
  { code: "ES", label: "Spain", qid: "Q29" },
  { code: "NL", label: "Netherlands", qid: "Q55" },
  { code: "BE", label: "Belgium", qid: "Q31" },
  { code: "SE", label: "Sweden", qid: "Q34" },
  { code: "NO", label: "Norway", qid: "Q20" },
  { code: "DK", label: "Denmark", qid: "Q35" },
  { code: "FI", label: "Finland", qid: "Q33" },
  { code: "IS", label: "Iceland", qid: "Q189" },
  { code: "IE", label: "Ireland", qid: "Q27" },
  { code: "PT", label: "Portugal", qid: "Q45" },
  { code: "AT", label: "Austria", qid: "Q40" },
  { code: "CH", label: "Switzerland", qid: "Q39" },
  { code: "PL", label: "Poland", qid: "Q36" },
  { code: "CZ", label: "Czech Republic", qid: "Q213" },
  { code: "SK", label: "Slovakia", qid: "Q214" },
  { code: "HU", label: "Hungary", qid: "Q28" },
  { code: "RO", label: "Romania", qid: "Q218" },
  { code: "BG", label: "Bulgaria", qid: "Q219" },
  { code: "GR", label: "Greece", qid: "Q41" },
  { code: "HR", label: "Croatia", qid: "Q224" },
  { code: "SI", label: "Slovenia", qid: "Q215" },
  { code: "EE", label: "Estonia", qid: "Q191" },
  { code: "LV", label: "Latvia", qid: "Q211" },
  { code: "LT", label: "Lithuania", qid: "Q37" },
  { code: "LU", label: "Luxembourg", qid: "Q32" },
  { code: "MT", label: "Malta", qid: "Q233" },
  { code: "CY", label: "Cyprus", qid: "Q229" },
  { code: "LI", label: "Liechtenstein", qid: "Q347" },
];

const MIDDLE_EAST: Array<{ code: string; label: string; qid: string }> = [
  { code: "IL", label: "Israel", qid: "Q801" },
  { code: "AE", label: "United Arab Emirates", qid: "Q878" },
  { code: "SA", label: "Saudi Arabia", qid: "Q851" },
  { code: "QA", label: "Qatar", qid: "Q846" },
  { code: "BH", label: "Bahrain", qid: "Q398" },
  { code: "KW", label: "Kuwait", qid: "Q817" },
  { code: "OM", label: "Oman", qid: "Q842" },
  { code: "JO", label: "Jordan", qid: "Q810" },
  { code: "LB", label: "Lebanon", qid: "Q822" },
  { code: "TR", label: "Turkey", qid: "Q43" },
  { code: "EG", label: "Egypt", qid: "Q79" },
];

const ASIA: Array<{ code: string; label: string; qid: string }> = [
  { code: "IN", label: "India", qid: "Q668" },
  { code: "JP", label: "Japan", qid: "Q17" },
  { code: "CN", label: "China", qid: "Q148" },
  { code: "SG", label: "Singapore", qid: "Q334" },
  { code: "KR", label: "South Korea", qid: "Q884" },
  { code: "TW", label: "Taiwan", qid: "Q865" },
  { code: "HK", label: "Hong Kong", qid: "Q8646" },
  { code: "ID", label: "Indonesia", qid: "Q252" },
  { code: "VN", label: "Vietnam", qid: "Q881" },
  { code: "TH", label: "Thailand", qid: "Q869" },
  { code: "MY", label: "Malaysia", qid: "Q833" },
  { code: "PH", label: "Philippines", qid: "Q928" },
  { code: "PK", label: "Pakistan", qid: "Q843" },
  { code: "BD", label: "Bangladesh", qid: "Q902" },
];

export const REGION_SEEDS: RegionSeed[] = [
  ...US_STATES.map(state => ({
    code: `US-${state.code}`,
    label: `${state.label}, USA`,
    country: "US",
    admin1: state.code,
    searchHint: `${state.label}, USA`,
    wikidataQid: state.qid,
  })),
  ...CANADIAN_PROVINCES.map(p => ({
    code: `CA-${p.code}`,
    label: `${p.label}, Canada`,
    country: "CA",
    admin1: p.code,
    searchHint: `${p.label}, Canada`,
    wikidataQid: p.qid,
  })),
  ...EUROPE.map(c => ({
    code: c.code,
    label: c.label,
    country: c.code,
    searchHint: c.label,
    wikidataQid: c.qid,
  })),
  ...MIDDLE_EAST.map(c => ({
    code: c.code,
    label: c.label,
    country: c.code,
    searchHint: c.label,
    wikidataQid: c.qid,
  })),
  ...ASIA.map(c => ({
    code: c.code,
    label: c.label,
    country: c.code,
    searchHint: c.label,
    wikidataQid: c.qid,
  })),
];

export function findRegion(code: string): RegionSeed | null {
  return REGION_SEEDS.find(r => r.code === code) ?? null;
}
