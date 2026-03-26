export type SignalSource = {
  /**
   * Stable identifier stored in `signals.source`.
   * Examples: "techcrunch", "google_news_funding", "google_news_crunchbase_news"
   */
  source: string;
  /**
   * RSS/Atom URL returning items with <title>, <description>, <link>, <pubDate>.
   * We rely on RSS here (no HTML crawling).
   */
  url: string;
  /**
   * Optional hint for tag-specific sources.
   * When present, the ingestion layer can attach the tag to `seedTags`.
   */
  seedTag?: string;
};

export const SIGNAL_SOURCE_DEFINITIONS: SignalSource[] = [
  { source: "techcrunch", url: "https://techcrunch.com/feed/" },
  { source: "the_verge", url: "https://www.theverge.com/rss/index.xml" },
  { source: "venturebeat", url: "https://venturebeat.com/feed/" },
  { source: "wired_business", url: "https://www.wired.com/feed/category/business/latest/rss" },
  { source: "crunchbase_news", url: "https://news.crunchbase.com/feed/" },
  { source: "thenextweb", url: "https://thenextweb.com/feed/" },
  { source: "nine_to_five_mac", url: "https://9to5mac.com/feed/" },
  { source: "nine_to_five_google", url: "https://9to5google.com/feed/" },
  { source: "ars_technica", url: "https://arstechnica.com/feed/" },
  { source: "gigaom", url: "https://gigaom.com/feed/" },
  { source: "reuters_business", url: "https://www.reuters.com/rssFeed/businessNews" },
  { source: "cnbc_business", url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { source: "ft_main", url: "https://www.ft.com/?format=rss" },
  { source: "bloomberg_surveillance", url: "https://www.bloomberg.com/feed/podcast/bloomberg-surveillance.xml" },
  { source: "bbc_business", url: "https://www.bbc.com/news/business/rss.xml" },
  { source: "nyt_business", url: "https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/section/business/rss.xml" },
  { source: "economist_business", url: "https://www.economist.com/business/rss.xml" },
  { source: "wsj_business", url: "https://www.wsj.com/xml/rss/3_7014.xml" },
  { source: "guardian_business", url: "https://www.theguardian.com/uk/business/rss" },
  { source: "forbes_business", url: "https://www.forbes.com/business/feed2/" },
  { source: "businessinsider_sai", url: "https://www.businessinsider.com/sai/rss" },
  { source: "marketwatch_topstories", url: "https://www.marketwatch.com/rss/topstories" },
  { source: "seekingalpha", url: "https://seekingalpha.com/feed.xml" },
  { source: "investopedia_topstories", url: "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=topstories" },
  { source: "valuewalk", url: "https://www.valuewalk.com/feed/" },
  { source: "fool_feeds", url: "https://www.fool.com/feeds/index.aspx" },
  { source: "barrons_marketdata", url: "https://www.barrons.com/xml/rss/marketdata.xml" },
  { source: "syncedreview", url: "https://syncedreview.com/feed/" },
  { source: "theinformation", url: "https://www.theinformation.com/rss" },
  { source: "mit_technologyreview", url: "https://www.technologyreview.com/feed/" },
  { source: "venturebeat_ai", url: "https://venturebeat.com/category/ai/feed/" },
  { source: "ai_googleblog", url: "https://ai.googleblog.com/feeds/posts/default" },
  { source: "openai_blog", url: "https://openai.com/blog/rss/" },
  { source: "deepmind_blog", url: "https://deepmind.com/blog/rss.xml" },
  { source: "huggingface_blog", url: "https://huggingface.co/blog/rss" },
  { source: "nikkei_asia", url: "https://asia.nikkei.com/rss/feed/nar" },
  { source: "scmp_business", url: "https://www.scmp.com/rss/91/feed" },
  { source: "livemint", url: "https://www.livemint.com/rss" },
  { source: "ft_world", url: "https://www.ft.com/world?format=rss" },
  { source: "dw_business", url: "https://www.dw.com/en/top-stories/business/s-1431" },
  { source: "cnbc_world", url: "https://www.cnbc.com/world/?region=world" },
  { source: "reuters_finance", url: "https://www.reuters.com/finance/rss" },
  { source: "abc_au_business", url: "https://www.abc.net.au/news/business/rss.xml" },
  { source: "pitchbook", url: "https://pitchbook.com/rss" },
  { source: "tech_eu", url: "https://tech.eu/feed/" },
  { source: "seedtable", url: "https://seedtable.com/feed" },
  { source: "startupbeat", url: "https://www.startupbeat.com/feed/" },
  { source: "eu_startups", url: "https://www.eu-startups.com/feed/" },
  { source: "angel_blog", url: "https://angel.co/blog/feed" },
  { source: "betalist_blog", url: "https://betalist.com/blog/feed" },
  { source: "cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "decrypt", url: "https://decrypt.co/feed" },
  { source: "coindesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { source: "finextra_news", url: "https://finextra.com/rss/news" },
  { source: "finextra_fintech", url: "https://www.finextra.com/rss/fintech" },
  { source: "theblock", url: "https://www.theblock.co/rss" },
];

export function buildTagSpecificSources(selectedTags: string[]): SignalSource[] {
  return [];
}

export function getSourcesForProfile(input: {
  sourcesEnabled?: string[] | null;
  selectedTags?: string[] | null;
}): SignalSource[] {
  return input.sourcesEnabled?.length
    ? SIGNAL_SOURCE_DEFINITIONS.filter(s => input.sourcesEnabled!.includes(s.source))
    : SIGNAL_SOURCE_DEFINITIONS;
}

