import { describe, expect, test } from "vitest";
import {
  buildEmailVerificationFromLinkedIn,
  generateEmailCandidates,
  resolveCompanyDomainFromProfile,
  verifyEmailLegitimacy,
  type DnsLookupResult,
} from "./services/emailVerificationTool";

function dnsFixture(map: Record<string, Partial<DnsLookupResult>>) {
  return async (domain: string): Promise<DnsLookupResult> => {
    const key = domain.toLowerCase().replace(/^www\./, "");
    const hit = map[key];
    return {
      domain: key,
      hasMx: hit?.hasMx ?? false,
      hasA: hit?.hasA ?? false,
      hasAaaa: hit?.hasAaaa ?? false,
      mxRecords: hit?.mxRecords ?? [],
    };
  };
}

describe("email verification tool", () => {
  test("generates common patterns for name+domain", () => {
    const candidates = generateEmailCandidates({
      fullName: "Jane Doe",
      domain: "acme.com",
      limit: 6,
    });
    expect(candidates.map(c => c.email)).toContain("jane.doe@acme.com");
    expect(candidates.map(c => c.email)).toContain("jdoe@acme.com");
  });

  test("resolves domain from explicit hint first", async () => {
    const result = await resolveCompanyDomainFromProfile(
      {
        companyName: "Acme Labs",
        companyDomainHint: "acme.com",
      },
      {
        dnsLookup: dnsFixture({
          "acme.com": { hasMx: true, mxRecords: ["mx.acme.com"] },
        }),
      },
    );
    expect(result.domain).toBe("acme.com");
    expect(result.source).toBe("domain_hint");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  test("falls back to generated company domains", async () => {
    const result = await resolveCompanyDomainFromProfile(
      {
        companyName: "Acme Labs Inc",
      },
      {
        dnsLookup: dnsFixture({
          "acmelabs.com": { hasA: true },
        }),
      },
    );
    expect(result.domain).toBe("acmelabs.com");
    expect(result.source).toBe("company_name_probe");
  });

  test("marks malformed email as invalid", async () => {
    const result = await verifyEmailLegitimacy("not-an-email");
    expect(result.verdict).toBe("invalid");
    expect(result.isValidSyntax).toBe(false);
  });

  test("marks dns-backed corporate email as likely legit", async () => {
    const result = await verifyEmailLegitimacy("jane.doe@acme.com", {
      dnsLookup: dnsFixture({
        "acme.com": { hasMx: true, mxRecords: ["mx.acme.com"] },
      }),
    });
    expect(result.verdict).toBe("likely_legit");
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  test("flags disposable domains as risky", async () => {
    const result = await verifyEmailLegitimacy("jane@mailinator.com", {
      dnsLookup: dnsFixture({
        "mailinator.com": { hasMx: true, mxRecords: ["mx.mailinator.com"] },
      }),
    });
    expect(result.isDisposableDomain).toBe(true);
    expect(result.verdict).toBe("risky");
  });

  test("builds full linkedin-based flow", async () => {
    const result = await buildEmailVerificationFromLinkedIn(
      {
        fullName: "John Doe",
        companyName: "Acme Labs",
        linkedinUrl: "https://www.linkedin.com/in/john-doe-123/",
        companyDomainHint: "acme.com",
        maxCandidates: 4,
      },
      {
        dnsLookup: dnsFixture({
          "acme.com": { hasMx: true, mxRecords: ["mx.acme.com"] },
        }),
      },
    );
    expect(result.domainResolution.domain).toBe("acme.com");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.bestCandidate?.verdict).toBe("likely_legit");
  });
});
