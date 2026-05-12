// Domain resolver entry-point used by the queue worker.
//
// Uses article/href evidence and deterministic domain candidates only (no
// search-engine HTML). Candidate hosts are verified with `safeFetch` (crawler
// User-Agent, SSRF guards, robots when enabled, throttle).

import { getCompanyById, markCompanyDomainVerified, normalizeDomain } from "./repository";
import {
  listDeterministicCompanyDomainCandidates,
  tryResolveCompanyDomainFromEvidence,
} from "../companyDomainResolver";
import { safeFetch } from "./safeFetch";

export async function resolveCompanyDomain(companyId: number): Promise<void> {
  const company = await getCompanyById(companyId);
  if (!company) return;
  if (company.domain) return;

  const evidence = tryResolveCompanyDomainFromEvidence({
    company: company.name,
    article_html: "",
    article_text: "",
  });

  let candidate: string | null = evidence?.domain ? normalizeDomain(evidence.domain) : null;
  let alreadyProbed = false;

  if (!candidate) {
    for (const raw of listDeterministicCompanyDomainCandidates(company.name)) {
      const norm = normalizeDomain(raw);
      if (!norm) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await probeDomain(norm);
      if (ok) {
        candidate = norm;
        alreadyProbed = true;
        break;
      }
    }
  }

  if (!candidate) return;
  if (!alreadyProbed) {
    const ok = await probeDomain(candidate);
    if (!ok) return;
  }
  await markCompanyDomainVerified(companyId, candidate);
}

async function probeDomain(domain: string): Promise<boolean> {
  const res = await safeFetch(`https://${domain}`);
  if (res && res.status >= 200 && res.status < 400) return true;
  const fallback = await safeFetch(`http://${domain}`);
  return Boolean(fallback && fallback.status >= 200 && fallback.status < 400);
}
