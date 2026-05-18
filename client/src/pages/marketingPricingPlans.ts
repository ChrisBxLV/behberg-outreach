export type PricingPlan = {
  name: string;
  price: string;
  label: string;
  /** Shown under the price, e.g. billing cadence. */
  periodNote?: string;
  highlight?: boolean;
  bullets: string[];
};

export const marketingPricingPlans: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    label: "Try Krot",
    periodNote: "per month",
    bullets: [
      "1 mailbox (limited sends)",
      "100 saved contacts",
      "50 enrichments / month",
      "Basic sequencing + CSV upload",
      "Limited signals (core set only)",
    ],
  },
  {
    name: "Starter",
    price: "$59",
    label: "Small team outbound",
    periodNote: "per month",
    bullets: [
      "1 connected email inbox",
      "2,000 saved contacts",
      "1,000 enrichments / month",
      "Full sequencing + contact search",
      "Basic signals + CSV upload",
    ],
  },
  {
    name: "Growth",
    price: "$149",
    label: "Most popular",
    periodNote: "per month",
    highlight: true,
    bullets: [
      "3 connected email inboxes",
      "10,000 saved contacts",
      "5,000 enrichments / month",
      "Advanced signals + analytics",
      "Automations (Zapier / CRM hooks)",
    ],
  },
  {
    name: "Scale",
    price: "$299",
    label: "Higher volume",
    periodNote: "per month",
    bullets: [
      "5 connected email inboxes",
      "30,000 saved contacts",
      "15,000 enrichments / month",
      "Premium signals + priority processing",
      "Advanced analytics + reporting",
    ],
  },
  {
    name: "Pro / Teams",
    price: "$499",
    label: "Team operations",
    periodNote: "per month",
    bullets: [
      "10 connected email inboxes",
      "100,000 saved contacts",
      "50,000 enrichments / month",
      "Advanced automations + integrations",
      "Team roles, audit logs, priority support",
    ],
  },
];
