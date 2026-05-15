import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  ChevronUp,
  Code2,
  Database,
  DollarSign,
  Mail,
  Moon,
  Newspaper,
  Search,
  ShieldCheck,
  Sun,
  Target,
  Users,
  UserRoundPlus,
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

type Snapshot = {
  title: string;
  caption: string;
  icon: LucideIcon;
  variant: "contact-search" | "sequence" | "signals";
};

type SimpleStep = {
  title: string;
  text: string;
  icon: LucideIcon;
};

type Principle = {
  title: string;
  text: string;
  icon: LucideIcon;
};

type PricingPlan = {
  name: string;
  price: string;
  label: string;
  highlight?: boolean;
  bullets: string[];
};

const simpleSteps: SimpleStep[] = [
  {
    title: "Find contacts",
    text: "Search the database and keep the people you want to reach in one place.",
    icon: Search,
  },
  {
    title: "Start a sequence",
    text: "Move saved contacts into a clear email flow without imports or extra setup.",
    icon: Mail,
  },
  {
    title: "Send with context",
    text: "Use account signals when they matter, so emails feel timely without more research.",
    icon: BellRing,
  },
];

const principles: Principle[] = [
  {
    title: "One obvious next step",
    text: "Every screen should make the next action clear: save, add to sequence, review signal, or launch.",
    icon: ArrowRight,
  },
  {
    title: "Power stays close to the work",
    text: "Signals, contacts, and sequences live together instead of hiding behind separate tools.",
    icon: Database,
  },
  {
    title: "Less setup, more sending",
    text: "Teams can get from contact search to a campaign without building a complicated GTM machine.",
    icon: Mail,
  },
  {
    title: "Clear controls for teams",
    text: "Connected inboxes, roles, and analytics are there when needed without making daily work heavy.",
    icon: ShieldCheck,
  },
];

const snapshots: Snapshot[] = [
  {
    title: "Search the database",
    caption: "Find contacts and save them or add them directly to a sequence.",
    icon: Search,
    variant: "contact-search",
  },
  {
    title: "Build sequences",
    caption: "Create email flows from saved contacts and connected inboxes.",
    icon: Mail,
    variant: "sequence",
  },
  {
    title: "Use timely signals",
    caption: "Bring account news and market events into your outreach context.",
    icon: BellRing,
    variant: "signals",
  },
];

const pricingPlans: PricingPlan[] = [
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

const faqs = [
  {
    question: "What is Krot?",
    answer:
      "Krot is a focused B2B outbound platform that combines contact search, email sequences, real-time signals, and campaign analytics in one workspace that is easy for teams to adopt.",
  },
  {
    question: "How does Krot work?",
    answer:
      "Teams search the contact database, save contacts or add them directly to a sequence, write outreach, and use real-time signals to improve timing and context without adding extra operational layers.",
  },
  {
    question: "Who is Krot built for?",
    answer:
      "Krot is built for recruitment agencies, marketing agencies, and B2B sales teams that need a faster way to turn contacts and timely account context into sales conversations.",
  },
  {
    question: "How does contact search work?",
    answer:
      "Users can search the Krot contact database, review relevant contact records, save contacts, upload CSVs, or add selected contacts directly into a sequence.",
  },
  {
    question: "Can teams send from their own inboxes?",
    answer:
      "Yes. Krot is designed around connected user inboxes so outbound stays authentic while teams keep centralized campaign control.",
  },
  {
    question: "What role do signals play in Krot?",
    answer:
      "Signals give teams timely context such as hiring, funding, news, or account changes. They help teams decide when to reach out and what context to reference in email.",
  },
  {
    question: "Does Krot provide campaign analytics?",
    answer:
      "Yes. Teams can review outreach performance, reply activity, meetings, inbox health, and pipeline outcomes from the workspace.",
  },
  {
    question: "Can Krot fit into an existing sales process?",
    answer:
      "Yes. Krot supports common outbound processes, including CSV uploads, connected inboxes, team roles, and automations for CRM or other sales tools depending on the plan.",
  },
  {
    question: "Can I try Krot for free?",
    answer:
      "Yes. The free plan lets teams explore Krot with a limited mailbox, saved contacts, contact search, and basic sequencing.",
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

function ContactSearchVisual() {
  const rows = [
    { name: "Maya Chen", role: "VP Sales", company: "Northstar Labs", action: "Add to sequence" },
    { name: "Jon Bell", role: "Head of Growth", company: "BluePeak Systems", action: "Save contact" },
    { name: "Priya Shah", role: "Founder", company: "OrbitOps", action: "Add to sequence" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Contact search
          </div>
          <div className="text-lg font-black text-foreground">Database results</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background/70">
        {rows.map((row, index) => (
          <div
            key={row.name}
            className={cn(
              "grid grid-cols-[1fr_auto] gap-3 px-4 py-3",
              index !== rows.length - 1 && "border-b border-border/70",
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold text-foreground">{row.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <span>{row.role}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>{row.company}</span>
              </div>
            </div>
            <div className="flex items-center">
              <span className="rounded-full border border-border bg-card/80 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                {row.action}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SequenceVisual() {
  const steps = [
    { label: "Email 1", timing: "Day 1", subject: "Personal intro", status: "Ready" },
    { label: "Email 2", timing: "Day 3", subject: "Signal follow-up", status: "Queued" },
    { label: "Email 3", timing: "Day 7", subject: "Reply reminder", status: "Draft" },
  ];

  return (
    <div className="rounded-xl border border-border bg-background/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Sequence timeline
          </div>
          <div className="text-lg font-black text-foreground">3-step email flow</div>
        </div>
        <span className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-primary">
          Active
        </span>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.label} className="relative flex gap-3">
            {index !== steps.length - 1 ? (
              <div className="absolute left-5 top-10 h-[calc(100%-1rem)] w-px bg-border" />
            ) : null}
            <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-xl border border-border bg-card/85 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-foreground">{step.label}</div>
                  <div className="mt-1 text-xs font-semibold text-muted-foreground">
                    {step.subject}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-primary">{step.timing}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {step.status}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalsVisual() {
  const signals = [
    { label: "Funding", strength: "High", icon: DollarSign },
    { label: "Hiring", strength: "Medium", icon: UserRoundPlus },
    { label: "Tech stack", strength: "High", icon: Code2 },
    { label: "News", strength: "Fresh", icon: Newspaper },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {signals.map(({ label, strength, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-border bg-background/70 p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
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

  return <ContactSearchVisual />;
}

function HeroEmailMotionPanel() {
  const emailCards = [
    {
      label: "Contact search",
      title: "Find the right people",
      text: "Search the database, save contacts, or add them straight to a campaign.",
      icon: Search,
      className: "left-4 top-8 rotate-[-2deg] krot-email-card-a",
    },
    {
      label: "Real-time signal",
      title: "New hiring activity",
      text: "Use fresh account context to make outreach more timely.",
      icon: BellRing,
      className: "right-4 top-24 rotate-[2deg] krot-email-card-b",
    },
    {
      label: "Email sequence",
      title: "Personalized follow-up",
      text: "Launch a sequence from a connected inbox and track replies.",
      icon: Mail,
      className: "left-10 bottom-7 rotate-[-1deg] krot-email-card-c",
    },
  ];

  return (
    <div className="relative min-h-[31rem] p-2 sm:p-6">
      <style>
        {`
          @keyframes krot-email-float-a {
            0%, 100% { transform: translate3d(0, 0, 0) rotate(-2deg); }
            50% { transform: translate3d(10px, -14px, 0) rotate(0deg); }
          }
          @keyframes krot-email-float-b {
            0%, 100% { transform: translate3d(0, 0, 0) rotate(2deg); }
            50% { transform: translate3d(-12px, 12px, 0) rotate(0deg); }
          }
          @keyframes krot-email-float-c {
            0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg); }
            50% { transform: translate3d(12px, 10px, 0) rotate(1deg); }
          }
          .krot-email-card-a { animation: krot-email-float-a 6s ease-in-out infinite; }
          .krot-email-card-b { animation: krot-email-float-b 7s ease-in-out infinite; }
          .krot-email-card-c { animation: krot-email-float-c 6.5s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .krot-email-card-a,
            .krot-email-card-b,
            .krot-email-card-c { animation: none; }
          }
        `}
      </style>

      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_26%,rgba(196,160,66,0.15),transparent_26%),radial-gradient(circle_at_80%_22%,rgba(99,179,237,0.12),transparent_24%),radial-gradient(circle_at_50%_84%,rgba(196,160,66,0.10),transparent_28%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-sm rounded-3xl border border-border bg-background/80 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Sequence builder
            </div>
            <div className="text-xl font-black text-foreground">Email campaign ready</div>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {["Intro email", "Signal follow-up", "Reply reminder"].map((step, index) => (
            <div key={step} className="rounded-2xl border border-border bg-card/85 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-foreground">{step}</div>
                <div className="text-xs font-bold text-primary">0{index + 1}</div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-primary/15">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${82 - index * 12}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {emailCards.map(({ label, title, text, icon: Icon, className }) => (
        <div
          key={label}
          className={cn(
            "absolute z-20 w-56 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur max-sm:static max-sm:mt-4 max-sm:w-full max-sm:rotate-0",
            className,
          )}
        >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-primary">
            <Icon className="h-4 w-4" />
            {label}
          </div>
          <div className="mt-2 text-sm font-black text-foreground">{title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
        </div>
      ))}
    </div>
  );
}

function SimplicitySection() {
  return (
    <section className="py-16">
      <LandingContainer>
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">
              Simple by design
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              The full outbound loop, without the maze.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Krot is built for teams that want the reach of a modern outbound stack
              without turning daily selling into tool administration. Search, sequence,
              signal context, and replies stay close together.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {principles.map((principle) => {
              const Icon = principle.icon;
              return (
                <div
                  key={principle.title}
                  className="rounded-3xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-black text-foreground">{principle.title}</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {principle.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </LandingContainer>
    </section>
  );
}

function HeroProductMockup() {
  const heroStats: { label: string; value: string; icon: LucideIcon }[] = [
    { label: "Saved", value: "128", icon: Database },
    { label: "Signals", value: "24", icon: BellRing },
    { label: "Replies", value: "21%", icon: BarChart3 },
  ];

  return (
    <BrowserChrome>
      <div className="bg-background/60 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Search to sequence
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">
              Contact and campaign workspace
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-2 text-xs font-bold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Pipeline active
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
          <div className="rounded-2xl border border-border bg-card/80 p-4">
            <ContactSearchVisual />
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
              <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
                <div>
                  <h1 className="text-4xl font-black leading-[1.02] tracking-tight text-foreground sm:text-6xl">
                    Outbound that feels lighter from the first click.
                  </h1>
                  <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                    Krot brings contact search, email sequences, and real-time buying
                    signals into one focused workspace. Teams get the outbound engine they
                    need without wrestling with a bloated sales stack.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <PrimaryCtaLink href="/signup">
                      <span className="flex items-center gap-2">
                        Register for Free <ArrowRight className="h-4 w-4" />
                      </span>
                    </PrimaryCtaLink>
                    <SecondaryCtaLink href="#product">
                      <span className="flex items-center gap-2">
                        See the product <ArrowRight className="h-4 w-4" />
                      </span>
                    </SecondaryCtaLink>
                  </div>
                </div>

                <HeroEmailMotionPanel />
              </div>
            </LandingContainer>
          </section>

          <section className="pb-12">
            <LandingContainer>
              <div className="grid gap-3 md:grid-cols-3">
                {simpleSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      className="rounded-2xl border border-border bg-card/75 p-5 backdrop-blur"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="text-xs font-black uppercase tracking-[0.22em] text-primary">
                          Step {index + 1}
                        </div>
                      </div>
                      <div className="mt-4 text-xl font-black text-foreground">{step.title}</div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                    </div>
                  );
                })}
              </div>
            </LandingContainer>
          </section>

          <section id="product" className="relative isolate overflow-hidden border-y border-border bg-card/30 py-16">
            <DataParticlesBackground id="product-particles" variant="section" />
            <LandingContainer className="relative z-10">
              <SectionHeader
                eyebrow="Product"
                title="Everything important stays in view."
                text="Contacts, sequences, signals, and replies are connected in a workspace that feels calm, fast, and deliberate."
              />

              <div className="mt-10">
                <HeroProductMockup />
              </div>

              <div className="mt-8 grid gap-5 lg:grid-cols-3">
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

          <SimplicitySection />

          <section className="py-16">
            <LandingContainer>
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div className="rounded-3xl border border-border bg-card/80 p-7">
                  <SectionHeader
                    eyebrow="Trust"
                    title="Control without clutter."
                    text="Krot gives teams practical controls for outbound without burying daily work under unnecessary configuration."
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
                        Spot hiring signals, find contacts, and launch timely client outreach.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-5">
                      <Target className="h-5 w-5 text-primary" />
                      <div className="mt-4 text-2xl font-black text-foreground">B2B sales</div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Search contacts, add them to campaigns, and personalize from signal context.
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

          <section className="border-y border-border bg-card/30 py-10">
            <LandingContainer>
              <Accordion
                type="single"
                collapsible
                className="overflow-hidden rounded-3xl border border-border bg-card/80 px-5 shadow-sm backdrop-blur sm:px-7"
              >
                <AccordionItem id="team" value="team">
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">Team</div>
                      <div className="mt-1 text-2xl font-black text-foreground">Built by operators.</div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      {versionSevenFounders.map((founder) => (
                        <article
                          key={founder.name + founder.role}
                          className="rounded-2xl border border-border bg-background/70 p-5 shadow-sm"
                        >
                          <img
                            src={founder.photoSrc}
                            alt={founder.photoAlt}
                            className="h-24 w-24 rounded-2xl border border-border/70 bg-muted/30 object-cover"
                            loading="lazy"
                          />
                          <div className="mt-4 text-base font-black text-foreground">{founder.name}</div>
                          <div className="mt-1 text-xs font-bold uppercase tracking-wide text-primary">
                            {founder.role}
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {founder.bio}
                          </p>
                        </article>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem id="pricing" value="pricing">
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">Pricing</div>
                      <div className="mt-1 text-2xl font-black text-foreground">Choose the right plan.</div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      {pricingPlans.map((plan) => (
                        <div
                          key={plan.name}
                          className={cn(
                            "flex h-full flex-col rounded-2xl border bg-background/70 p-5",
                            plan.highlight ? "border-primary" : "border-border",
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
                                : "border-border bg-card/80 text-foreground",
                            )}
                          >
                            Get started
                          </a>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 rounded-2xl border border-border bg-background/70 p-4 text-sm font-semibold text-muted-foreground">
                      Need custom integrations? Contact{" "}
                      <a href="mailto:sales@krot.io" className="text-foreground underline underline-offset-4">
                        sales@krot.io
                      </a>
                      .
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem id="faq" value="faq">
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">FAQ</div>
                      <div className="mt-1 text-2xl font-black text-foreground">
                        Frequently asked questions.
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Accordion type="single" collapsible className="w-full rounded-2xl border border-border bg-background/70 px-5">
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </LandingContainer>
          </section>

          <section className="py-16">
            <LandingContainer>
              <div className="overflow-hidden rounded-3xl border border-border bg-card/80 p-8 sm:p-10">
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">
                      Get started
                    </div>
                    <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                      Turn contact search and signals into email outreach.
                    </h2>
                    <p className="mt-3 max-w-2xl text-muted-foreground">
                      Search the database, save contacts, connect inboxes, and launch
                      sequences with timely account context.
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
