import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BellRing,
  Code2,
  DollarSign,
  Mail,
  Newspaper,
  Search,
  ShieldCheck,
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
import MarketingLayout, { LandingContainer } from "@/components/MarketingLayout";
import MarketingPricingPlansGrid from "@/components/MarketingPricingPlansGrid";
import { getPublicHomeUrl } from "@/const";
import { cn } from "@/lib/utils";

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

function PrimaryCtaLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex touch-manipulation items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 transition hover:-translate-y-0.5 hover:opacity-90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:min-h-11",
        className,
      )}
    >
      {children}
    </a>
  );
}

function SecondaryCtaLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex touch-manipulation items-center justify-center rounded-xl border border-border bg-card/75 px-5 py-3 text-sm font-bold text-foreground transition hover:-translate-y-0.5 hover:bg-card active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:min-h-11",
        className,
      )}
    >
      {children}
    </a>
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
      className: "left-2 top-6 rotate-[-2deg] krot-email-card-a sm:left-4 sm:top-8",
    },
    {
      label: "Real-time signal",
      title: "New hiring activity",
      text: "Use fresh account context to make outreach more timely.",
      icon: BellRing,
      className: "right-2 top-20 rotate-[2deg] krot-email-card-b sm:right-4 sm:top-24",
    },
    {
      label: "Email sequence",
      title: "Personalized follow-up",
      text: "Launch a sequence from a connected inbox and track replies.",
      icon: Mail,
      className: "left-4 bottom-8 rotate-[-1deg] krot-email-card-c max-sm:left-2 sm:left-10 sm:bottom-7",
    },
    {
      label: "Campaign health",
      title: "Inbox and sends on track",
      text: "Catch deliverability dips and reply trends before they slow pipeline.",
      icon: ShieldCheck,
      className: "right-4 bottom-10 rotate-[1.5deg] krot-email-card-d max-sm:right-2 sm:right-8",
    },
  ];

  return (
    <div className="relative min-h-[26rem] p-2 sm:min-h-[28rem] sm:p-6 lg:min-h-[34rem]">
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
          @keyframes krot-email-float-d {
            0%, 100% { transform: translate3d(0, 0, 0) rotate(1.5deg); }
            50% { transform: translate3d(-10px, -10px, 0) rotate(0.5deg); }
          }
          @keyframes krot-hero-mole-drift {
            0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(0, -8px, 0) scale(1.03); }
          }
          .krot-email-card-a { animation: krot-email-float-a 6s ease-in-out infinite; }
          .krot-email-card-b { animation: krot-email-float-b 7s ease-in-out infinite; }
          .krot-email-card-c { animation: krot-email-float-c 6.5s ease-in-out infinite; }
          .krot-email-card-d { animation: krot-email-float-d 7.5s ease-in-out infinite; }
          .krot-hero-mole {
            animation: krot-hero-mole-drift 5.5s ease-in-out infinite;
            transform-origin: 50% 85%;
          }
          @media (prefers-reduced-motion: reduce) {
            .krot-email-card-a,
            .krot-email-card-b,
            .krot-email-card-c,
            .krot-email-card-d,
            .krot-hero-mole { animation: none; }
          }
        `}
      </style>

      {/* Light edge accents only so the mole stays fully visible in the centre */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_18%,rgba(196,160,66,0.09),transparent_32%),radial-gradient(circle_at_88%_16%,rgba(99,179,237,0.07),transparent_30%),radial-gradient(circle_at_50%_92%,rgba(196,160,66,0.06),transparent_36%)]"
        aria-hidden
      />

      {/* Peek mole (grey + yellow flat art) — separate from the yellow-circle nav logo */}
      <div className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-center py-6 sm:py-8">
        <img
          src="/krot-logo-source.png"
          alt="Krot"
          decoding="async"
          className="krot-hero-mole h-auto w-full max-w-[min(92%,18rem)] select-none drop-shadow-[0_14px_32px_rgba(0,0,0,0.14)] sm:max-w-[21rem] lg:max-w-[26rem] dark:drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        />
      </div>

      {emailCards.map(({ label, title, text, icon: Icon, className }) => (
        <div
          key={label}
          className={cn(
            "absolute z-30 w-52 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm max-sm:static max-sm:mt-3 max-sm:w-full max-sm:rotate-0 sm:w-56",
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
      <h2 className="mt-3 text-balance text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {text ? (
        <p className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground">{text}</p>
      ) : null}
    </div>
  );
}

export default function VisualProductLanding({
  brandHomeHref = getPublicHomeUrl(),
}: VisualProductLandingProps) {
  return (
    <MarketingLayout brandHomeHref={brandHomeHref}>
      <main className="min-w-0 touch-manipulation">
        <section className="pt-28 pb-16 sm:pt-36 sm:pb-20 lg:pb-24">
          <LandingContainer>
            <div className="grid min-w-0 items-center gap-8 sm:gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
              <div className="min-w-0">
                  <h1 className="text-balance break-words text-4xl font-black leading-[1.02] tracking-tight text-foreground sm:text-6xl">
                    Outbound that feels lighter from the first click.
                  </h1>
                  <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                    Krot brings contact search, email sequences, and real-time buying
                    signals into one focused workspace. Teams get the outbound engine they
                    need without wrestling with a bloated sales stack.
                  </p>
                  <div className="mt-8 flex max-w-lg flex-col gap-3 sm:max-w-none sm:flex-row">
                    <PrimaryCtaLink href="/signup">
                      <span className="flex items-center gap-2">
                        Register for Free <ArrowRight className="h-4 w-4" />
                      </span>
                    </PrimaryCtaLink>
                    <SecondaryCtaLink href="/demo">
                      <span className="flex items-center gap-2">
                        See the product <ArrowRight className="h-4 w-4" />
                      </span>
                    </SecondaryCtaLink>
                  </div>
              </div>

              <div className="min-w-0">
                <HeroEmailMotionPanel />
              </div>
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

          <section id="product" className="relative isolate overflow-hidden border-y border-border bg-card/30 py-12 lg:py-16">
            <DataParticlesBackground id="product-particles" variant="section" />
            <LandingContainer className="relative z-10">
              <SectionHeader
                eyebrow="Product"
                title="Everything important stays in view."
                text="Contacts, sequences, signals, and replies are connected in a workspace that feels calm, fast, and deliberate."
              />

              <div className="mt-10 grid gap-5 lg:grid-cols-3">
                {snapshots.map((snapshot) => {
                  const Icon = snapshot.icon;
                  return (
                    <article
                      key={snapshot.title}
                      className="flex min-h-0 flex-col rounded-3xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur lg:min-h-[26rem]"
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

          <section className="py-16">
            <LandingContainer>
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div className="rounded-3xl border border-border bg-card/80 p-5 lg:p-7">
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

                <div className="rounded-3xl border border-border bg-card/80 p-5 lg:p-7">
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

          <section id="pricing" className="border-y border-border bg-card/30 py-12 sm:py-16">
            <LandingContainer>
              <SectionHeader
                eyebrow="Pricing"
                title="Choose the plan that fits your team."
                text="Start free and add connected inboxes, signals, and automations as volume grows. Every tier includes the same focused workflow—capacity and depth scale with you."
              />
              <MarketingPricingPlansGrid className="mt-8" />
            </LandingContainer>
          </section>

          <section id="faq" className="border-b border-border bg-card/30 py-10">
            <LandingContainer>
              <div className="overflow-hidden rounded-3xl border border-border bg-card/80 px-5 py-6 shadow-sm backdrop-blur sm:px-7 sm:py-8">
                <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">FAQ</div>
                <h2 className="mt-2 text-balance text-2xl font-black text-foreground sm:text-3xl">
                  Frequently asked questions.
                </h2>
                <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                  Straight answers about how Krot fits into outbound, inboxes, and team workflows.
                </p>
                <Accordion type="single" collapsible className="mt-6 w-full rounded-2xl border border-border bg-background/70 px-3 sm:px-5">
                  {faqs.map((item) => (
                    <AccordionItem key={item.question} value={item.question}>
                      <AccordionTrigger className="max-lg:min-h-[3.25rem] max-lg:items-center max-lg:text-[15px] text-left font-black text-foreground lg:items-start">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-pretty text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
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
                    <h2 className="mt-3 text-balance text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                      Turn contact search and signals into email outreach.
                    </h2>
                    <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
                      Search the database, save contacts, connect inboxes, and launch
                      sequences with timely account context.
                    </p>
                  </div>
                  <PrimaryCtaLink href="/signup" className="w-full lg:w-auto lg:shrink-0">
                    <span className="flex items-center gap-2">
                      Register for Free <ArrowRight className="h-4 w-4" />
                    </span>
                  </PrimaryCtaLink>
                </div>
              </div>
            </LandingContainer>
          </section>
        </main>
      </MarketingLayout>
  );
}
