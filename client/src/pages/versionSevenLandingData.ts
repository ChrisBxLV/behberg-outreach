export type Metric = {
  label: string;
  value: string;
  delta?: string;
};

export type CaseStudy = {
  title: string;
  subtitle: string;
  outcome: string;
  metrics: string[];
  href?: string;
};

export type Testimonial = {
  quote: string;
  name: string;
  title: string;
  company: string;
};

export type Feature = {
  title: string;
  description: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export const versionSevenMetrics: Metric[] = [
  { label: "Tracked Accounts", value: "3,420", delta: "+18%" },
  { label: "New Signals Today", value: "187", delta: "+11%" },
  { label: "Sequence Reply Rate", value: "21%", delta: "+4%" },
  { label: "Inbox Deliverability", value: "97.8%", delta: "+1.2%" },
  { label: "Leads Enriched", value: "12,940" },
  { label: "Meetings Influenced", value: "46 this week" },
];

export const versionSevenCaseStudies: CaseStudy[] = [
  {
    title: "Northbridge Capital",
    subtitle: "Private Equity Research",
    outcome: "2 priority deals discovered in 30 days",
    metrics: ["Signal-to-meeting in 9 days", "High-intent shortlist generated"],
    href: "https://www.versionseven.ai/case-studies/summit-growth",
  },
  {
    title: "ScaleOps",
    subtitle: "B2B SaaS Growth Team",
    outcome: "Pipeline coverage increased by 41%",
    metrics: ["Reply quality improved", "Faster ICP account activation"],
    href: "https://www.versionseven.ai/case-studies/automatio",
  },
  {
    title: "Bluegate Advisory",
    subtitle: "M&A Advisory",
    outcome: "News-triggered outreach running daily",
    metrics: ["Funding and acquisition alerts", "One workspace for signals + outbound"],
    href: "https://www.versionseven.ai/case-studies/victoria-ai",
  },
];

export const versionSevenTestimonials: Testimonial[] = [
  {
    quote:
      "Krot gives us one place for lead generation, news signals, and outbound execution. We go from signal to personalized sequence in minutes, using our own connected inboxes.",
    name: "Head of Revenue Ops",
    title: "Revenue Operations",
    company: "Mid-market B2B SaaS",
  },
];

export const versionSevenAddOns = [
  {
    title: "Signal Workflows",
    description:
      "Route acquisition, funding, and market-change signals directly into account lists and sequence triggers.",
    href: "https://www.versionseven.ai/sales-copilot",
    cta: "Learn more",
  },
  {
    title: "Lead Intelligence",
    description:
      "Discover and enrich ICP contacts, then push ready-to-work leads into outbound automatically.",
    href: "https://www.versionseven.ai/sales-database",
    cta: "Learn more",
  },
  {
    title: "Inbox Orchestration",
    description:
      "Run multi-step email sequences from connected user inboxes with centralized governance and analytics.",
    href: "https://www.versionseven.ai/pipeline-accelerator",
    cta: "Learn more",
  },
];

export const versionSevenFeatures: Feature[] = [
  {
    title: "Connected Inbox Sequences",
    description:
      "Send personalized sequences directly from each user's connected mailbox while keeping orchestration centralized.",
  },
  {
    title: "B2B Lead Generation Engine",
    description:
      "Build and maintain ICP lead pools with enrichment and segmentation designed for outbound teams.",
  },
  {
    title: "News Signal Monitoring",
    description:
      "Track M&A, funding rounds, leadership moves, and market news to time outreach when intent is highest.",
  },
  {
    title: "AI Message Personalization",
    description:
      "Generate tailored messaging using account context, recent events, and contact-level intelligence.",
  },
  {
    title: "Signal-to-Sequence Automation",
    description:
      "Move from detected trigger to active outreach sequence in minutes through workflow automation.",
  },
  {
    title: "Unified Analytics",
    description:
      "Track sequence performance, inbox health, signal impact, and conversion outcomes in one view.",
  },
];

export const versionSevenWhyItems = [
  {
    title: "Timing Advantage",
    description:
      "Reach accounts when important events happen, not weeks later after momentum fades.",
  },
  {
    title: "Higher Reply Quality",
    description:
      "Use account context and live signals to make outreach materially more relevant.",
  },
  {
    title: "Operational Simplicity",
    description:
      "Replace disconnected lead-gen, sequencing, and signal tools with one operating layer.",
  },
  {
    title: "Inbox-native Delivery",
    description:
      "Sequences are delivered from real connected user inboxes to preserve trust and authenticity.",
  },
  {
    title: "Better Coverage",
    description:
      "Continuously discover net-new leads and keep account maps fresh as companies change.",
  },
  {
    title: "Revenue Focused",
    description:
      "Align intelligence, outreach, and follow-up around what creates pipeline and meetings.",
  },
];

export const versionSevenFaq: { title: string; items: FaqItem[] } = {
  title: "Frequently Asked Questions",
  items: [
    {
      question: "What is Krot and how does it work?",
      answer:
        "Krot is a B2B intelligence and outbound execution platform. It combines lead generation, news signal monitoring, and inbox-native email sequencing in one workflow.",
    },
    {
      question: "What types of news signals can Krot track?",
      answer:
        "Krot can track events such as acquisitions, funding rounds, strategic announcements, and other account-level news that indicate potential buying momentum.",
    },
    {
      question: "Can Krot run sequences from our team inboxes?",
      answer:
        "Yes. Krot is designed to execute email sequences from connected user inboxes so outreach stays authentic while still centrally managed.",
    },
    {
      question: "Does Krot include lead generation?",
      answer:
        "Yes. Krot includes lead generation and enrichment workflows so teams can continuously build and refresh target account lists.",
    },
    {
      question: "How quickly can teams move from signal to outreach?",
      answer:
        "Krot is built to reduce response time from days to minutes by turning high-intent account signals into ready-to-launch sequence actions.",
    },
    {
      question: "Who is Krot best for?",
      answer:
        "Krot is built for B2B revenue teams, outbound teams, and GTM operators that need better account intelligence and more timely outreach execution.",
    },
  ],
};

