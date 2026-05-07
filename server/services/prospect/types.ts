// Shared types for the prospect crawler & seed adapters.

export type CompanyDraft = {
  name: string;
  domain?: string | null;
  hqCountry?: string | null;
  hqAdmin1?: string | null;
  hqCity?: string | null;
  headcount?: number | null;
  headcountBand?: string | null;
  industryCode?: string | null;
  subIndustryCode?: string | null;
  linkedinUrl?: string | null;
  source: ProspectSource;
  sourceEvidenceUrl?: string | null;
};

export type EmployeeDraft = {
  /** Either companyId (if known) or company hint for upsertEmployee to resolve. */
  companyId?: number | null;
  companyDomainHint?: string | null;
  companyNameHint?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  title?: string | null;
  seniorityLevel?: SeniorityLevel | null;
  locationCountry?: string | null;
  locationAdmin1?: string | null;
  locationCity?: string | null;
  linkedinUrl?: string | null;
  /**
   * Optional email observed alongside the person (e.g. CSV import). Used as a
   * dedupe key and stored on the row when no email is yet known.
   */
  emailHint?: string | null;
  /** True when the caller has already verified `emailHint` (CSV with "valid" status). */
  emailHintVerified?: boolean;
  source: ProspectSource;
  sourceEvidenceUrl?: string | null;
};

export type ProspectSource =
  | "wikidata"
  | "sec_edgar"
  | "uk_ch"
  | "linkedin_serp"
  | "website"
  | "user_import"
  | "unknown";

export type SeniorityLevel =
  | "c_level"
  | "head"
  | "director"
  | "manager"
  | "ic"
  | "unknown";

export type SeedAdapter = {
  kind: string;
  /** Returns drafts to upsert plus optional follow-up queue jobs. */
  run(input: SeedRunInput): Promise<SeedRunResult>;
};

export type SeedRunInput = {
  seedId: number;
  region: string;
  payload: Record<string, unknown> | null;
};

export type SeedRunResult = {
  companies: CompanyDraft[];
  employees: EmployeeDraft[];
  followupJobs?: QueueJobDraft[];
  /** Set when the source intentionally throttled itself (e.g. SERP rate limit). */
  throttled?: boolean;
};

export type QueueJobKind =
  | "resolve_domain"
  | "crawl_website"
  | "harvest_employee"
  | "guess_emails"
  | "verify_mx";

export type QueueJobDraft = {
  kind: QueueJobKind;
  payload: Record<string, unknown>;
  priority?: number;
  availableAt?: Date;
};
