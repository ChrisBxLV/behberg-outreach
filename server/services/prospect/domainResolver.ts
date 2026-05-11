// Domain resolver entry-point used by the queue worker.
//
// Reuses the existing deterministic resolver in
// `server/services/companyDomainResolver.ts` (which already implements the
// Google -> DDG -> Bing fallback). After resolution, we HEAD-probe the candidate,
// and on success update the company row with the verified domain and queue a
// follow-up website crawl.

import { getCompanyById, markCompanyDomainVerified, normalizeDomain } from "./repository";
import { resolveCompanyDomainDeterministic } from "../companyDomainResolver";
import { safeFetch } from "./safeFetch";

export async function resolveCompanyDomain(companyId: number): Promise<void> {
  const company = await getCompanyById(companyId);
  if (!company) return;
  if (company.domain) return; // already resolved

  const resolved = await resolveCompanyDomainDeterministic({
    company: company.name,
    article_html: "",
    article_text: "",
  });
  const candidate = normalizeDomain(resolved.domain ?? null);
  if (!candidate) return;

  // HEAD probe: ensure the domain actually serves a page.
  const ok = await probeDomain(candidate);
  if (!ok) return;
  await markCompanyDomainVerified(companyId, candidate);
}

async function probeDomain(domain: string): Promise<boolean> {
  const res = await safeFetch(`https://${domain}`);
  if (res && res.status >= 200 && res.status < 400) return true;
  const fallback = await safeFetch(`http://${domain}`);
  return Boolean(fallback && fallback.status >= 200 && fallback.status < 400);
}
