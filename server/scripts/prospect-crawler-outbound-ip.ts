/**
 * Diagnostic: which public IPv4 does the Prospect crawler's safeFetch present
 * to the internet? Uses api.ipify.org via the same stack as production (SSRF
 * checks, undici Agent bind when PROSPECT_CRAWLER_OUTBOUND_IP is set).
 *
 * Usage (from repo root):
 *   pnpm exec tsx server/scripts/prospect-crawler-outbound-ip.ts
 *
 * Optional: load .env first
 *   pnpm exec tsx --env-file=.env server/scripts/prospect-crawler-outbound-ip.ts
 */
import { diagnoseProspectCrawlerOutboundIp } from "../services/prospect/safeFetch";

async function main() {
  const r = await diagnoseProspectCrawlerOutboundIp();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
