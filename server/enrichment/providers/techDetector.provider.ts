import type { EnrichmentField, EnrichmentInput, EnrichmentProvider } from "../enrichment.types";

type Tech = {
  name: string;
  fieldValue: string;
  patterns: Array<string | RegExp>;
};

const TECHS: Tech[] = [
  { name: "WordPress", fieldValue: "wordpress", patterns: ["wp-content", "wp-includes", /<meta[^>]+name=["']generator["'][^>]*content=["'][^"']*wordpress/i] },
  { name: "Shopify", fieldValue: "shopify", patterns: ["cdn.shopify.com", "Shopify.theme", /x-shopify-stage/i] },
  { name: "WooCommerce", fieldValue: "woocommerce", patterns: ["woocommerce", "wc-ajax"] },
  { name: "Webflow", fieldValue: "webflow", patterns: ["webflow.com", "data-wf-page", "w-webflow-badge"] },
  { name: "Wix", fieldValue: "wix", patterns: ["wix.com", "X-Wix-Request-Id", "wix-bolt"] },
  { name: "Squarespace", fieldValue: "squarespace", patterns: ["squarespace.com", "static.squarespace.com"] },
  { name: "HubSpot", fieldValue: "hubspot", patterns: ["js.hs-scripts.com", "hsforms.net", "hubspotutk"] },
  { name: "Intercom", fieldValue: "intercom", patterns: ["intercomcdn.com", "window.intercomSettings", "api.intercom.io"] },
  { name: "Google Tag Manager", fieldValue: "gtm", patterns: ["googletagmanager.com/gtm.js", "dataLayer.push"] },
  { name: "Google Analytics", fieldValue: "google_analytics", patterns: ["google-analytics.com", "gtag(", "analytics.js"] },
  { name: "Meta Pixel", fieldValue: "meta_pixel", patterns: ["connect.facebook.net", "fbq("] },
  { name: "Hotjar", fieldValue: "hotjar", patterns: ["hotjar.com", "hjSettings"] },
  { name: "Calendly", fieldValue: "calendly", patterns: ["calendly.com", "assets.calendly.com"] },
  { name: "Stripe", fieldValue: "stripe", patterns: ["js.stripe.com", "stripe.com/v3"] },
];

function matchesAny(html: string, patterns: Array<string | RegExp>): boolean {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (html.includes(p)) return true;
    } else {
      if (p.test(html)) return true;
    }
  }
  return false;
}

export class TechDetectorProvider implements EnrichmentProvider {
  name = "tech_detector";

  constructor(private getHtml: (input: EnrichmentInput) => string | null) {}

  async enrich(input: EnrichmentInput): Promise<EnrichmentField[]> {
    const html = this.getHtml(input);
    if (!html) return [];

    const h = html.slice(0, 1_000_000);
    const detected = TECHS.filter(t => matchesAny(h, t.patterns)).map(t => t.fieldValue);
    const uniq = Array.from(new Set(detected));

    return uniq.map(v => ({
      source: "tech_detector",
      fieldName: "technology",
      fieldValue: v,
      confidence: 60,
      personalData: false,
    }));
  }
}

