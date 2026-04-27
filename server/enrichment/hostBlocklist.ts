/**
 * Hostnames that should not be treated as a company homepage for enrichment
 * (social networks, login walls, mobile wrappers).
 */
export function isBlockedCompanyWebsiteHost(hostname: string): boolean {
  const raw = hostname.toLowerCase().trim();
  const h = raw.replace(/^www\./, "");

  const blockedSuffixes = [
    "facebook.com",
    "fb.com",
    "fbcdn.net",
    "instagram.com",
    "linkedin.com",
    "lnkd.in",
    "twitter.com",
    "x.com",
    "t.co",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "snapchat.com",
    "pinterest.com",
    "reddit.com",
  ];

  for (const suf of blockedSuffixes) {
    if (h === suf || h.endsWith(`.${suf}`)) return true;
  }
  return false;
}
