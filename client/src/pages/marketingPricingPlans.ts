export type PricingPlan = {
  name: string;
  price: string;
  label: string;
  highlight?: boolean;
  bullets: string[];
};

export const marketingPricingPlans: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    label: "Try Krot",
    bullets: ["1 mailbox", "100 contacts", "Basic sequences"],
  },
  {
    name: "Starter",
    price: "$59",
    label: "Small team outbound",
    bullets: ["1 connected email", "2,000 saved contacts", "Contact search access"],
  },
  {
    name: "Growth",
    price: "$149",
    label: "Most popular",
    highlight: true,
    bullets: ["3 connected emails", "Advanced signals", "Analytics"],
  },
  {
    name: "Scale",
    price: "$299",
    label: "Higher volume",
    bullets: ["5 connected emails", "Premium signals", "Priority processing"],
  },
  {
    name: "Pro / Teams",
    price: "$499",
    label: "Team operations",
    bullets: ["10 connected emails", "Roles + audit logs", "Priority support"],
  },
];
