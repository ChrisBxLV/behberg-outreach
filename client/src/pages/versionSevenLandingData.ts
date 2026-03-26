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
  { label: "Qualified Leads", value: "3,420", delta: "+18%" },
  { label: "Sequence Reply Rate", value: "21%", delta: "+4%" },
  { label: "Positive Reply Rate", value: "11.4%", delta: "+2.1%" },
  { label: "Inbox Deliverability", value: "97.8%", delta: "+1.2%" },
  { label: "Leads Enriched", value: "12,940", delta: "+9%" },
  { label: "Meetings Booked", value: "46 this week" },
];

export const versionSevenCaseStudies: CaseStudy[] = [
  {
    title: "TalentForge Recruiting",
    subtitle: "Recruitment Agency",
    outcome: "31% higher meeting rate from sequenced outreach",
    metrics: ["Faster candidate-client matching", "Higher recruiter response quality"],
  },
  {
    title: "Launchlane Marketing",
    subtitle: "Marketing Agency",
    outcome: "Pipeline coverage increased by 41%",
    metrics: ["Reply quality improved", "Better lead prioritization"],
  },
  {
    title: "OutboundPilot",
    subtitle: "B2B Sales Team",
    outcome: "Lead-to-sequence activation under 10 minutes",
    metrics: ["Cleaner lead qualification", "Signals used as supportive context"],
  },
];

export const versionSevenTestimonials: Testimonial[] = [
  {
    quote:
      "Krot gives us one place for lead generation quality checks and outbound execution. The signals addon is a massive advantage for timing and personalization.",
    name: "Head of Revenue Ops",
    title: "Revenue Operations",
    company: "Mid-market B2B SaaS",
  },
];

export const versionSevenAddOns = [
  {
    title: "Lead Quality Guardrails",
    description:
      "Score and validate contacts before launch so teams prioritize high-intent, high-fit prospects.",
    cta: "Learn more",
  },
  {
    title: "Signals Layer (Addon)",
    description:
      "Use funding, hiring, and product signals as a high-impact addon that improves timing, relevance, and conversion quality.",
    cta: "Learn more",
  },
  {
    title: "Inbox Orchestration",
    description:
      "Run multi-step email sequences from connected user inboxes with centralized governance and analytics.",
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
    title: "Signals Context Addon",
    description:
      "Track major account events as a powerful context layer that sharpens messaging and increases sequence performance.",
  },
  {
    title: "AI Message Personalization",
    description:
      "Generate tailored messaging using account context, recent events, and contact-level intelligence.",
  },
  {
    title: "Signal-to-Sequence Automation",
    description:
      "Move from qualified lead to active outreach sequence in minutes through workflow automation.",
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
      "Reach qualified accounts quickly with consistent sequencing and faster lead activation.",
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
      question: "Are signals the core feature?",
      answer:
        "Krot is built around lead quality and sequencing, and the signals addon is a major performance layer for timing outreach and improving personalization.",
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
      question: "How quickly can teams move from lead qualification to outreach?",
      answer:
        "Krot is built to reduce response time from days to minutes by turning qualified leads into ready-to-launch sequence actions.",
    },
    {
      question: "Who is Krot best for?",
      answer:
        "Krot is built for recruitment agencies, marketing agencies, and B2B sales teams that need better account intelligence and more timely outreach execution.",
    },
  ],
};

