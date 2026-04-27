export type EnrichmentInput = {
  contactId: string;
  orgId: string;
  email?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  companyWebsite?: string | null;
  linkedinUrl?: string | null;
};

export type EnrichmentField = {
  source: "website" | "domain" | "manual" | "tech_detector";
  fieldName: string;
  fieldValue: string;
  confidence: number; // 0-100
  personalData: boolean;
  rawData?: unknown;
};

export interface EnrichmentProvider {
  name: string;
  enrich(input: EnrichmentInput): Promise<EnrichmentField[]>;
}

