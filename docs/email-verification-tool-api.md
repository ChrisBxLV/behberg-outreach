# Email Verification Tool API Design

This document defines a practical API for:
- building likely corporate email candidates from LinkedIn-like profile data,
- resolving company domain,
- verifying whether candidates are likely legitimate without sending any email.

## Endpoints

All endpoints are available under the tRPC namespace `emailVerification`.

### 1) `emailVerification.resolveDomain`

Resolve a company domain from strongest to weakest evidence:
1. `companyDomainHint`
2. `companyWebsite`
3. generated candidates from `companyName` + DNS probe

Input:
- `companyName: string` (required)
- `companyWebsite?: string`
- `companyDomainHint?: string`

Output:
- `domain: string | null`
- `confidence: number` (0..1)
- `source: "domain_hint" | "company_website" | "company_name_probe" | "unresolved"`
- `evidence: string[]`

### 2) `emailVerification.generateCandidates`

Generate common corporate email patterns for a person at a domain.

Input:
- `fullName: string` (required)
- `domain: string` (required)
- `limit: number` (default `6`, max `12`)

Output:
- `candidates: Array<{ email: string; pattern: string; confidence: number }>`

Patterns included:
- `first.last`
- `firstlast`
- `flast`
- `firstl`
- `f.last`
- `first.l`
- `first`

### 3) `emailVerification.verifyCandidates`

Passive legitimacy verification (no outbound email):
- syntax validation,
- DNS checks (MX/A/AAAA),
- disposable-domain detection,
- catch-all marked as unknown in passive mode.

Input:
- `emails: string[]` (min 1, max 20)

Output:
- `verifications: Array<{
    email: string;
    normalizedEmail: string | null;
    domain: string | null;
    isValidSyntax: boolean;
    isDisposableDomain: boolean;
    hasMx: boolean;
    hasAOrAaaa: boolean;
    catchAll: boolean | null;
    confidence: number;
    verdict: "likely_legit" | "risky" | "invalid";
    checks: Array<{ check: string; status: "pass" | "warn" | "fail"; detail: string }>;
  }>`

### 4) `emailVerification.buildFromLinkedIn`

One-call orchestration endpoint:
1. resolve domain,
2. generate candidates,
3. verify each candidate,
4. return best candidate.

Input:
- `fullName: string`
- `companyName: string`
- `linkedinUrl?: string`
- `companyWebsite?: string`
- `companyDomainHint?: string`
- `maxCandidates: number` (default `6`)

Output:
- `profile`
- `domainResolution`
- `candidates`
- `verifications`
- `bestCandidate`

## Example flow

Input:
- `fullName`: `John Doe`
- `companyName`: `Acme Labs`
- `companyDomainHint`: `acme.com`

Typical top candidates:
- `john.doe@acme.com`
- `jdoe@acme.com`
- `johndoe@acme.com`

Typical verdict:
- `john.doe@acme.com` => `likely_legit` when syntax is valid and MX exists.

## Compliance and safety notes

- Respect LinkedIn terms and privacy regulations when obtaining profile data.
- Use this as a probabilistic verifier; do not treat as proof of mailbox ownership.
- SMTP mailbox probing is intentionally not included in this implementation.
