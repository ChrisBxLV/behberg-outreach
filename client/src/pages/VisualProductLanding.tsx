import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  ChevronUp,
  Database,
  Mail,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Users,
  Zap,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import DataParticlesBackground from "@/components/DataParticlesBackground";
import { useCookieConsent } from "@/contexts/CookieConsentContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getPublicHomeUrl } from "@/const";
import { cn } from "@/lib/utils";
import { versionSevenFounders } from "./versionSevenLandingData";

type VisualProductLandingProps = {
  /** Header logo + brand tap target; should match the marketing route hosting this page (`/` vs `/home`). */
  brandHomeHref?: string;
};

type MetricCard = {
  value: string;
  label: string;
  detail: string;
};

type Snapshot = {
  title: string;
  caption: string;
  metric: string;
  icon: LucideIcon;
  variant: "lead-board" | "sequence" | "signals";
};

type PricingPlan = {
  name: string;
  price: string;
  label: string;
  highlight?: boolean;
  bullets: string[];
};

const metrics: MetricCard[] = [
  { value: "3,420", label: "qualified leads", detail: "ready for outreach" },
  { value: "21%", label: "sequence reply rate", detail: "workspace average" },
  { value: "97.8%", label: "inbox health", detail: "deliverability view" },
  { value: "10 min", label: "lead-to-sequence", detail: "from ICP to launch" },
];

const snapshots: Snapshot[] = [
  {
    title: "Find fit first",
    caption: "Score accounts before reps spend time writing.",
    metric: "84/100 fit score",
    icon: Target,
    variant: "lead-board",
  },
  {
    title: "Build approved sequences",
    caption: "Use variables and approvals before sending.",
    metric: "5-step email flow",
    icon: Mail,
    variant: "sequence",
  },
  {
    title: "Act on timing",
    caption: "Add signals when they make outreach more relevant.",
    metric: "3 fresh triggers",
    icon: BellRing,
    variant: "signals",
  },
];

const workflowSteps = [
  { label: "Search", detail: "ICP filters", icon: Search },
  { label: "Qualify", detail: "Fit score", icon: Target },
  { label: "Enrich", detail: "Clean contacts", icon: Database },
  { label: "Personalize", detail: "Message snippets", icon: Sparkles },
  { label: "Launch", detail: "Inbox-native", icon: Zap },
  { label: "Learn", detail: "Reply analytics", icon: BarChart3 },
];

const featureTiles = [
  { title: "Lead generation", text: "Build lists from ICP filters.", icon: Search },
  { title: "Enrichment", text: "Validate contacts before launch.", icon: Database },
  { title: "Sequencing", text: "Send from connected inboxes.", icon: Mail },
  { title: "Signals addon", text: "Spot timely account changes.", icon: BellRing },
  { title: "AI personalization", text: "Draft relevant first lines.", icon: Sparkles },
  { title: "Analytics", text: "Track replies and meetings.", icon: BarChart3 },
];

const pricingPlans: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    label: "Try the workflow",
    bullets: ["1 mailbox", "100 contacts", "Basic sequences"],
  },
  {
    name: "Starter",
    price: "$59",
    label: "Small team outbound",
    bullets: ["1 connected email", "2,000 contacts", "1,000 enrichments"],
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

const faqs = [
  {
    question: "What is Krot?",
    answer:
      "Krot is a B2B sales intelligence and outbound platform that helps teams find qualified leads, enrich contact data, build sequences, and track pipeline activity in one workspace.",
  },
  {
    question: "How does Krot work?",
    answer:
      "Teams define their ideal customer profile, review prioritized accounts, enrich the right contacts, create personalized outreach, and launch sequences from connected inboxes.",
  },
  {
    question: "Who is Krot built for?",
    answer:
      "Krot is built for recruitment agencies, marketing agencies, and B2B sales teams that need a faster way to turn target accounts into qualified conversations.",
  },
  {
    question: "Does Krot include lead generation and enrichment?",
    answer:
      "Yes. Krot helps teams build targeted lead lists, enrich contacts, and validate account fit before outreach starts.",
  },
  {
    question: "Can teams send from their own inboxes?",
    answer:
      "Yes. Krot is designed around connected user inboxes so outbound stays authentic while teams keep centralized workflow control.",
  },
  {
    question: "What role do signals play in Krot?",
    answer:
      "Signals give teams timely context such as hiring, funding, news, or account changes. They help improve timing and personalization, but they work alongside lead quality, enrichment, and sequencing.",
  },
  {
    question: "Does Krot provide campaign analytics?",
    answer:
      "Yes. Teams can review outreach performance, reply activity, meetings, inbox health, and pipeline outcomes from the workspace.",
  },
  {
    question: "Can Krot fit into an existing sales workflow?",
    answer:
      "Yes. Krot is designed to support common outbound workflows, including CSV uploads, connected inboxes, team roles, and automations for CRM or workflow tools depending on the plan.",
  },
  {
    question: "Can I try Krot for free?",
    answer:
      "Yes. The free plan lets teams explore the workflow with a limited mailbox, contacts, enrichments, and basic sequencing.",
  },
];

function LandingContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("w-full max-w-7xl mx-auto px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

function PrimaryCtaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 transition hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}

function SecondaryCtaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-xl border border-border bg-card/75 px-5 py-3 text-sm font-bold text-foreground transition hover:-translate-y-0.5 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}

function BrowserChrome({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/85 shadow-2xl shadow-primary/10 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border bg-muted/45 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-chart-3/70" />
        <div className="ml-3 h-6 flex-1 rounded-full border border-border bg-background/80 px-3 text-[11px] font-semibold leading-6 text-muted-foreground">
          app.krot.io/workspace
        </div>
      </div>
      {children}
    </div>
  );
}

function ScorePill({ value }: { value: string }) {
  return (
    <span className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-primary/40 bg-primary/12 px-3.5 py-1.5 text-center text-[11px] font-bold leading-none text-primary">
      {value}
    </span>
  );
}

function LeadBoardVisual() {
  const rows = [
    { account: "Northstar Labs", signal: "Hiring SDRs", score: "92", stage: "Ready" },
    { account: "BluePeak Systems", signal: "New funding", score: "87", stage: "Review" },
    { account: "OrbitOps", signal: "Tool change", score: "79", stage: "Enrich" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Lead quality board
          </div>
          <div className="text-lg font-black text-foreground">Prioritized accounts</div>
        </div>
        <ScorePill value="Live fit" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background/70">
        {rows.map((row, index) => (
          <div
            key={row.account}
            className={cn(
              "grid grid-cols-[1fr_auto] gap-3 px-4 py-3",
              index !== rows.length - 1 && "border-b border-border/70",
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold text-foreground">{row.account}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <span>{row.signal}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>{row.stage}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-black text-primary">{row.score}</div>
              <div className="text-[10px] font-semibold text-muted-foreground">score</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SequenceVisual() {
  const steps = [
    { label: "Email 1", value: "Personal intro", width: "w-[82%]" },
    { label: "Email 2", value: "Signal follow-up", width: "w-[68%]" },
    { label: "Email 3", value: "Proof point", width: "w-[74%]" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/35 bg-primary/10 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-primary">
          Message preview
        </div>
        <div className="mt-2 rounded-lg border border-border bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground">
          Hi {"{{first_name}}"}, saw {"{{account_signal}}"}. Krot flagged a likely fit
          because {"{{fit_reason}}"}. Worth a quick look?
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.label} className="rounded-xl border border-border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-bold">
              <span className="text-foreground">{step.label}</span>
              <span className="text-muted-foreground">{step.value}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-primary/15">
              <div className={cn("h-2 rounded-full bg-primary", step.width)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalsVisual() {
  const signals = [
    ["Funding", "High"],
    ["Hiring", "Medium"],
    ["Tech stack", "High"],
    ["News", "Fresh"],
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {signals.map(([label, strength]) => (
        <div key={label} className="rounded-xl border border-border bg-background/70 p-4">
          <div className="h-16 rounded-lg bg-[radial-gradient(circle_at_35%_35%,rgba(196,160,66,0.42),transparent_32%),radial-gradient(circle_at_70%_65%,rgba(99,179,237,0.25),transparent_30%)]" />
          <div className="mt-3 text-sm font-extrabold text-foreground">{label}</div>
          <div className="text-xs font-semibold text-muted-foreground">{strength} timing value</div>
        </div>
      ))}
    </div>
  );
}

function SnapshotVisual({ variant }: { variant: Snapshot["variant"] }) {
  if (variant === "sequence") {
    return <SequenceVisual />;
  }

  if (variant === "signals") {
    return <SignalsVisual />;
  }

  return <LeadBoardVisual />;
}

function HeroProductMockup() {
  const heroStats: { label: string; value: string; icon: LucideIcon }[] = [
    { label: "Fit", value: "92", icon: Target },
    { label: "Contacts", value: "128", icon: Database },
    { label: "Replies", value: "21%", icon: BarChart3 },
  ];

  return (
    <BrowserChrome>
      <div className="bg-background/60 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
              ICP to outbound
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">
              Pipeline command center
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-2 text-xs font-bold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Pipeline active
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
          <div className="rounded-2xl border border-border bg-card/80 p-4">
            <LeadBoardVisual />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {heroStats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-border bg-card/80 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-4 text-2xl font-black text-foreground">{value}</div>
                <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

function SectionHeader({
  eyebrow,
  title,
  text,
  center,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {text ? (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{text}</p>
      ) : null}
    </div>
  );
}

export default function VisualProductLanding({
  brandHomeHref = getPublicHomeUrl(),
}: VisualProductLandingProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const { openModal: openCookiePreferences } = useCookieConsent();
  const { theme, toggleTheme, switchable } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div id="top" className="relative isolate min-h-screen overflow-x-clip bg-background text-foreground">
      <DataParticlesBackground />
      <div className="relative z-10">
        <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-card/75 backdrop-blur-xl">
          <LandingContainer>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <a href={brandHomeHref} className="flex items-center">
                <img
                  src="/logoipsum-294.svg"
                  alt="Krot"
                  className="h-8 w-auto select-none"
                />
                <span className="ml-2 text-sm font-black tracking-wide text-primary">krot.io</span>
              </a>

              <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-muted-foreground sm:gap-x-5">
                <a href="#product" className="transition hover:text-foreground">
                  Product
                </a>
                <a href="#workflow" className="transition hover:text-foreground">
                  Workflow
                </a>
                <a href="#team" className="transition hover:text-foreground">
                  Team
                </a>
                <a href="#pricing" className="transition hover:text-foreground">
                  Pricing
                </a>
                <a href="#faq" className="transition hover:text-foreground">
                  FAQ
                </a>
                {switchable && toggleTheme ? (
                  <button
                    type="button"
                    onClick={(event) => toggleTheme?.(event)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
                <a
                  href="/login"
                  className="inline-flex items-center rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-primary transition hover:bg-primary/15"
                >
                  Log in
                </a>
              </nav>
            </div>
          </LandingContainer>
        </header>

        <main>
          <section className="pt-28 pb-16 sm:pt-32 lg:pb-20">
            <LandingContainer>
              <div className="grid items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-black text-primary">
                    <Sparkles className="h-4 w-4" />
                    B2B outbound platform
                  </div>
                  <h1 className="mt-6 text-4xl font-black leading-[1.02] tracking-tight text-foreground sm:text-6xl">
                    See who to contact, why now, and what to send.
                  </h1>
                  <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                    Krot turns lead quality, enrichment, signals, and inbox-native
                    sequencing into one GTM workspace.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <PrimaryCtaLink href="/signup">
                      <span className="flex items-center gap-2">
                        Register for Free <ArrowRight className="h-4 w-4" />
                      </span>
                    </PrimaryCtaLink>
                    <SecondaryCtaLink href="#product">
                      <span className="flex items-center gap-2">
                        See how it works <ArrowRight className="h-4 w-4" />
                      </span>
                    </SecondaryCtaLink>
                  </div>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {["Lead quality", "GDPR-aware workflows", "Connected inboxes"].map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] font-bold text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <HeroProductMockup />
              </div>
            </LandingContainer>
          </section>

          <section className="pb-12">
            <LandingContainer>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-border bg-card/75 p-5 backdrop-blur"
                  >
                    <div className="text-3xl font-black text-foreground">{metric.value}</div>
                    <div className="mt-1 text-sm font-bold text-foreground">{metric.label}</div>
                    <div className="text-xs font-semibold text-muted-foreground">{metric.detail}</div>
                  </div>
                ))}
              </div>
            </LandingContainer>
          </section>

          <section id="product" className="border-y border-border bg-card/30 py-16">
            <LandingContainer>
              <SectionHeader
                eyebrow="Product"
                title="See Krot in action."
                text="Review lead fit, sequence performance, signal timing, and pipeline outcomes from one workspace."
              />

              <div className="mt-10 grid gap-5 lg:grid-cols-3">
                {snapshots.map((snapshot) => {
                  const Icon = snapshot.icon;
                  return (
                    <article
                      key={snapshot.title}
                      className="flex min-h-[31rem] flex-col rounded-3xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur"
                    >
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <h3 className="mt-4 text-2xl font-black text-foreground">
                            {snapshot.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {snapshot.caption}
                          </p>
                        </div>
                        <ScorePill value={snapshot.metric} />
                      </div>
                      <div className="mt-auto rounded-2xl border border-border bg-muted/25 p-4">
                        <SnapshotVisual variant={snapshot.variant} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </LandingContainer>
          </section>

          <section id="workflow" className="py-16">
            <LandingContainer>
              <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
                <SectionHeader
                  eyebrow="Workflow"
                  title="From target account to reply."
                  text="Krot connects prospecting, enrichment, personalization, sequencing, and analytics in one workflow."
                />

                <div className="rounded-3xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
                  <div className="grid gap-3 md:grid-cols-3">
                    {workflowSteps.map((step, index) => {
                      const Icon = step.icon;
                      return (
                        <div key={step.label} className="relative">
                          <div className="rounded-2xl border border-border bg-background/70 p-4">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="mt-4 text-lg font-black text-foreground">{step.label}</div>
                            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                              {step.detail}
                            </div>
                          </div>
                          {index !== workflowSteps.length - 1 ? (
                            <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-primary/35 md:block" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </LandingContainer>
          </section>

          <section className="border-y border-border bg-card/30 py-16">
            <LandingContainer>
              <SectionHeader
                eyebrow="Features"
                title="Everything needed to move faster."
                center
              />
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featureTiles.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="rounded-2xl border border-border bg-card/80 p-5 transition hover:-translate-y-0.5 hover:border-primary/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="text-lg font-black text-foreground">{feature.title}</div>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-muted-foreground">{feature.text}</p>
                    </div>
                  );
                })}
              </div>
            </LandingContainer>
          </section>

          <section className="py-16">
            <LandingContainer>
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div className="rounded-3xl border border-border bg-card/80 p-7">
                  <SectionHeader
                    eyebrow="Trust"
                    title="Secure-by-design outbound."
                    text="Krot keeps the marketing promise simple: useful automation, clear controls, and privacy-aware execution."
                  />
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {[
                      ["Permission-aware", "Role-based access"],
                      ["Data minimized", "Only what teams need"],
                      ["Audit-ready", "Operational visibility"],
                      ["Inbox-native", "Authentic delivery"],
                    ].map(([title, text]) => (
                      <div key={title} className="rounded-2xl border border-border bg-background/70 p-4">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <div className="mt-3 text-sm font-black text-foreground">{title}</div>
                        <div className="text-xs font-semibold text-muted-foreground">{text}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-card/80 p-7">
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">
                    Sales view
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background/70 p-5">
                      <Users className="h-5 w-5 text-primary" />
                      <div className="mt-4 text-2xl font-black text-foreground">Recruiting</div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Spot hiring signals, map accounts, launch timely client outreach.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-5">
                      <Target className="h-5 w-5 text-primary" />
                      <div className="mt-4 text-2xl font-black text-foreground">B2B sales</div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Prioritize high-fit accounts and personalize from verified context.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-5 sm:col-span-2">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-black text-foreground">Pipeline preview</div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Weekly outcome
                          </div>
                        </div>
                        <ScorePill value="46 meetings" />
                      </div>
                      <div className="grid grid-cols-6 items-end gap-2">
                        {[34, 46, 58, 49, 72, 81].map((height, index) => (
                          <div key={height + index} className="flex h-28 items-end rounded-xl bg-muted/60 p-1.5">
                            <div
                              className="w-full rounded-lg bg-primary"
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </LandingContainer>
          </section>

          <section id="team" className="border-y border-border bg-card/30 py-16">
            <LandingContainer>
              <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
                <SectionHeader
                  eyebrow="Team"
                  title="Built by operators who lived the problem."
                  text="Krot is led by founders with security, recruiting, and hands-on outbound experience, which shapes the product around practical growth and trust."
                />

                <div className="grid gap-4 md:grid-cols-3">
                  {versionSevenFounders.map((founder) => (
                    <article
                      key={founder.name + founder.role}
                      className="rounded-3xl border border-border bg-card/80 p-5 shadow-sm"
                    >
                      <img
                        src={founder.photoSrc}
                        alt={founder.photoAlt}
                        className="h-28 w-28 rounded-2xl border border-border/70 bg-muted/30 object-cover"
                        loading="lazy"
                      />
                      <div className="mt-5 text-lg font-black text-foreground">{founder.name}</div>
                      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-primary">
                        {founder.role}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {founder.bio}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </LandingContainer>
          </section>

          <section id="pricing" className="py-16">
            <LandingContainer>
              <SectionHeader
                eyebrow="Pricing"
                title="Choose the right plan."
                text="Short plans, clear limits, and a simple path to getting started."
              />
              <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {pricingPlans.map((plan) => (
                  <div
                    key={plan.name}
                    className={cn(
                      "flex h-full flex-col rounded-3xl border bg-card/80 p-5",
                      plan.highlight
                        ? "border-primary shadow-[0_0_0_1px_rgba(196,160,66,0.2)]"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-black text-foreground">{plan.name}</div>
                      {plan.highlight ? <ScorePill value="Popular" /> : null}
                    </div>
                    <div className="mt-4 text-4xl font-black text-foreground">{plan.price}</div>
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {plan.label}
                    </div>
                    <ul className="mt-5 flex-1 space-y-3 text-sm font-semibold text-muted-foreground">
                      {plan.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href="/signup"
                      className={cn(
                        "mt-6 inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-black transition hover:-translate-y-0.5",
                        plan.highlight
                          ? "border-primary/45 bg-primary/15 text-primary"
                          : "border-border bg-background/70 text-foreground",
                      )}
                    >
                      Get started
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4 text-sm font-semibold text-muted-foreground">
                Need custom integrations? Contact{" "}
                <a href="mailto:sales@krot.io" className="text-foreground underline underline-offset-4">
                  sales@krot.io
                </a>
                .
              </div>
            </LandingContainer>
          </section>

          <section id="faq" className="py-16">
            <LandingContainer>
              <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
                <SectionHeader
                  eyebrow="FAQ"
                  title="Frequently asked questions."
                  text="Answers about the product, workflow, inboxes, analytics, and getting started."
                />
                <Accordion type="single" collapsible className="w-full rounded-3xl border border-border bg-card/80 px-5">
                  {faqs.map((item) => (
                    <AccordionItem key={item.question} value={item.question}>
                      <AccordionTrigger className="text-left font-black text-foreground">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </LandingContainer>
          </section>

          <section className="pb-16">
            <LandingContainer>
              <div className="overflow-hidden rounded-3xl border border-border bg-card/80 p-8 sm:p-10">
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">
                      Get started
                    </div>
                    <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                      Turn account context into sequenced outreach.
                    </h2>
                    <p className="mt-3 max-w-2xl text-muted-foreground">
                      Bring your ICP, connect inboxes, and move from qualified lead to
                      personalized sequence in one workspace.
                    </p>
                  </div>
                  <PrimaryCtaLink href="/signup">
                    <span className="flex items-center gap-2">
                      Register for Free <ArrowRight className="h-4 w-4" />
                    </span>
                  </PrimaryCtaLink>
                </div>
              </div>
            </LandingContainer>
          </section>
        </main>

        <footer className="border-t border-border bg-card/65 py-10">
          <LandingContainer>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
              {[
                "ISO 27001 aligned",
                "GDPR compliant",
                "Data encryption in transit and at rest",
                "Role-based access controls",
              ].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-bold text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="text-center text-sm font-bold text-muted-foreground">
              Krot - B2B intelligence and outbound execution.
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-xs text-muted-foreground">
              <a
                href="/privacy"
                className="font-semibold underline underline-offset-4 hover:text-foreground"
              >
                Privacy Policy
              </a>
              <a
                href="/privacy/remove"
                className="font-semibold underline underline-offset-4 hover:text-foreground"
              >
                Do not contact / Opt-out request
              </a>
              <button
                type="button"
                onClick={openCookiePreferences}
                className="rounded-sm font-semibold underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cookie Preferences
              </button>
            </div>
          </LandingContainer>
        </footer>

        <button
          type="button"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={cn(
            "fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-bold text-foreground shadow-md backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-card",
            showBackToTop
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "translate-y-2 opacity-0 pointer-events-none",
          )}
        >
          <ChevronUp className="h-4 w-4" />
          Back to Top
        </button>
      </div>
    </div>
  );
}
