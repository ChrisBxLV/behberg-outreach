import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { getPublicHomeUrl } from "@/const";
import DataParticlesBackground from "@/components/DataParticlesBackground";
import {
  versionSevenAddOns,
  versionSevenCaseStudies,
  versionSevenFaq,
  versionSevenFeatures,
  versionSevenMetrics,
  versionSevenTestimonials,
  versionSevenWhyItems,
} from "./versionSevenLandingData";

function LandingContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("w-full max-w-6xl mx-auto px-4", className)}>{children}</div>
  );
}

function PrimaryCtaLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold px-5 py-3 shadow-sm hover:opacity-90 transition-opacity"
    >
      {children}
    </a>
  );
}

function SecondaryCtaLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-lg border border-border bg-card/70 text-foreground font-semibold px-5 py-3 hover:bg-card transition-colors"
    >
      {children}
    </a>
  );
}

function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {delta ? <div className="text-sm font-semibold text-primary">{delta}</div> : null}
      </div>
    </div>
  );
}

function CaseStudyCard({
  title,
  subtitle,
  outcome,
  metrics,
}: {
  title: string;
  subtitle: string;
  outcome: string;
  metrics: string[];
}) {
  const metricsText = useMemo(() => metrics.slice(0, 2), [metrics]);

  return (
    <div className="group block rounded-xl border border-border bg-card/70 p-6 hover:shadow-sm hover:border-primary/40 transition-shadow">
      <div className="text-xs text-muted-foreground font-medium">{subtitle}</div>
      <div className="mt-2 text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
        {title}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{outcome}</div>
      <div className="mt-4 space-y-2">
        {metricsText.map((m) => (
          <div key={m} className="text-xs text-muted-foreground">
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineStep({
  step,
  title,
  subtitle,
}: {
  step: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative pl-10 py-1">
      <div className="absolute left-0 top-1 h-6 min-w-6 rounded-md bg-primary/20 border border-primary/45 text-[11px] font-bold text-primary flex items-center justify-center px-1">
        {step}
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {subtitle ? <div className="text-xs text-muted-foreground mt-1">{subtitle}</div> : null}
    </div>
  );
}

type VersionSevenLandingReplicaProps = {
  /** Header logo + brand tap target; should match the marketing route hosting this page (`/` vs `/home`). */
  brandHomeHref?: string;
};

export default function VersionSevenLandingReplica({
  brandHomeHref = getPublicHomeUrl(),
}: VersionSevenLandingReplicaProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div id="top" className="min-h-screen bg-background text-foreground relative isolate overflow-x-clip">
      <DataParticlesBackground />
      <div className="relative z-10">
      {/* Top offer bar */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-card/70 backdrop-blur">
        <LandingContainer>
          <div className="py-3 text-sm flex items-center justify-between gap-3 flex-wrap max-sm:py-2 max-sm:text-xs max-sm:gap-2 max-[380px]:gap-1.5">
            <a href={brandHomeHref} className="flex items-center max-[380px]:w-full max-[380px]:justify-center">
              <img
                src="/logoipsum-294.svg"
                alt="Krot"
                className="h-8 w-auto select-none pointer-events-none max-[380px]:h-7"
              />
              <span className="ml-2 text-sm font-bold tracking-wide text-primary max-sm:text-xs">krot.io</span>
            </a>
            <div className="flex items-center gap-4 max-sm:w-full max-sm:justify-between max-sm:gap-2 max-[380px]:justify-center max-[380px]:flex-wrap max-[380px]:gap-x-3 max-[380px]:gap-y-1.5">
              <a href="#features" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors max-[380px]:text-[11px]">Features</a>
              <a href="#workflow" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors max-[380px]:text-[11px]">Workflow</a>
              <a href="#pricing" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors max-[380px]:text-[11px]">Pricing</a>
              <a href="#faq" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors max-[380px]:text-[11px]">FAQ</a>
              <a href="/login" className="ml-1 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors max-sm:px-2.5 max-sm:py-1 max-[380px]:ml-0 max-[380px]:px-2 max-[380px]:text-[11px]">Log In</a>
            </div>
          </div>
        </LandingContainer>
      </div>

      {/* Hero */}
      <section className="pt-24 pb-16 max-sm:pt-28 max-sm:pb-12">
        <LandingContainer>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start lg:items-center max-sm:gap-8">
            <div className="min-w-0 lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-sm font-semibold max-sm:text-xs max-sm:px-3 max-sm:py-1.5">
                <span>Sales Intelligence Engine</span>
                <span className="text-muted-foreground font-medium">built for B2B teams</span>
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.08] max-sm:text-3xl text-balance break-words">
                Turn Qualified Leads Into Meetings With Sequenced Outbound
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-muted-foreground max-w-xl max-sm:text-base text-pretty break-words">
                Krot is built around lead quality and inbox-native email sequencing.
                Find better-fit contacts, prioritize the right accounts, and launch
                structured outreach fast. Signals are included as supportive context,
                not the main workflow.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3 max-sm:gap-2.5">
                <PrimaryCtaLink href="/signup">
                  <span className="flex items-center gap-2 justify-center w-full">
                    Register for Free <ArrowRight className="h-4 w-4" />
                  </span>
                </PrimaryCtaLink>
                <SecondaryCtaLink href="#workflow">
                  <span className="flex items-center gap-2 justify-center w-full">
                    See How It Works <ArrowRight className="h-4 w-4" />
                  </span>
                </SecondaryCtaLink>
              </div>
            </div>

            <div className="min-w-0 lg:col-span-6">
              <div className="rounded-2xl border border-border bg-card/70 p-6 max-sm:p-4">
                <div className="relative w-full rounded-xl border border-border bg-background p-4 sm:p-5 max-sm:p-3">
                  <div
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                    aria-hidden
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(196,160,66,0.18),transparent_55%)]" />
                  </div>
                  <div className="relative z-10 grid grid-cols-1 auto-rows-auto gap-2.5 sm:grid-cols-2 sm:gap-3 sm:items-stretch">
                    <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-primary/35 bg-primary/10 p-3.5 sm:p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 text-xs font-semibold text-primary">
                          Email Sequencing Engine
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Active
                        </span>
                      </div>
                      <div className="text-sm font-semibold leading-snug text-foreground text-balance break-words">
                        Launch structured multi-step campaigns from connected inboxes.
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col rounded-lg border border-border/80 bg-card/80 p-3.5 transition-transform duration-300 hover:-translate-y-0.5 sm:min-h-[5.5rem]">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Lead Quality
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-snug text-foreground text-balance break-words">
                        Score fit before outreach starts.
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col rounded-lg border border-border/80 bg-card/80 p-3.5 transition-transform duration-300 hover:-translate-y-0.5 sm:min-h-[5.5rem]">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Signals Addon
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-snug text-foreground text-balance break-words">
                        Use market context to time messaging.
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col rounded-lg border border-border/80 bg-card/80 p-3.5 transition-transform duration-300 hover:-translate-y-0.5 sm:min-h-[5.5rem]">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Enrichment
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-snug text-foreground text-balance break-words">
                        Build clean contact lists instantly.
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col rounded-lg border border-border/80 bg-card/80 p-3.5 transition-transform duration-300 hover:-translate-y-0.5 sm:min-h-[5.5rem]">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Automations
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-snug text-foreground text-balance break-words">
                        Sync with CRMs and workflow tools.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </LandingContainer>
      </section>

      {/* KPI strip */}
      <section className="py-10">
        <LandingContainer>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {versionSevenMetrics.map((m) => (
              <StatCard key={m.label} label={m.label} value={m.value} delta={m.delta} />
            ))}
          </div>
        </LandingContainer>
      </section>

      {/* Real Results */}
      <section id="features" className="py-16 bg-card/30 border-y border-border">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            See How Teams Use Krot
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            From better lead quality to faster sequenced execution, here is how teams
            operationalize Krot.
          </p>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {versionSevenCaseStudies.map((cs) => (
              <CaseStudyCard key={cs.title} {...cs} />
            ))}
          </div>

        </LandingContainer>
      </section>

      {/* Testimonials */}
      <section className="py-16">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Built for Modern B2B Revenue Teams
          </h2>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {versionSevenTestimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-border bg-card/70 p-8 shadow-sm"
              >
                <div className="text-muted-foreground text-sm font-semibold">Testimonial</div>
                <div className="mt-3 text-xl leading-relaxed font-semibold text-foreground">
                  "{t.quote}"
                </div>
                <div className="mt-6">
                  <div className="text-sm font-bold text-foreground">{t.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t.title} at {t.company}
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-border bg-card/60 p-8">
              <div className="text-sm font-semibold text-muted-foreground">
                How Krot Works
              </div>
              <div className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">
                From Qualified Leads to Sequenced Outreach
              </div>
              <div className="mt-4 text-muted-foreground leading-relaxed">
                Qualify leads, identify matched accounts, enrich contacts,
                and launch inbox-native sequences with structured personalization,
                enhanced by real-time signals context.
              </div>

              <div className="mt-6 space-y-3">
                {[
                  "Score and prioritize leads directly from your ICP.",
                  "Generate and enrich contacts with quality checks.",
                  "Use the signals addon to time outreach and personalize at the right moment.",
                ].map((x) => (
                  <div key={x} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm font-semibold text-foreground">{x}</div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <PrimaryCtaLink href="#final-cta">
                  <span className="flex items-center gap-2">
                    Start Your Trial <ArrowRight className="h-4 w-4" />
                  </span>
                </PrimaryCtaLink>
              </div>
            </div>
          </div>
        </LandingContainer>
      </section>

      {/* Add-ons */}
      <section className="py-16 bg-card/30 border-t border-border">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Expand Your Intelligence Stack
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Layer in specialized workflows for lead quality, sequencing governance,
            and optional signals context as your motion scales.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            {versionSevenAddOns.map((a) => (
              <div
                key={a.title}
                className="block rounded-2xl border border-border bg-card/70 p-7 hover:shadow-sm hover:border-primary/40 transition-shadow"
              >
                <div className="text-lg font-extrabold text-foreground">{a.title}</div>
                <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.description}</div>
                <div className="mt-6 inline-flex items-center gap-2 font-semibold text-foreground">
                  {a.cta} <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            ))}
          </div>
        </LandingContainer>
      </section>

      {/* Features + timeline */}
      <section id="workflow" className="py-16">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            How Krot Turns Intelligence Into Pipeline
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Lead quality operations, sequence automation, and analytics designed to
            help B2B teams prioritize and execute with precision.
          </p>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {versionSevenFeatures.map((f) => (
                  <div key={f.title} className="rounded-2xl border border-border bg-card/70 p-6">
                    <div className="text-base font-extrabold">{f.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {f.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-card/60 p-6">
                <div className="text-sm font-semibold text-muted-foreground">Execution Roadmap</div>
                <div className="mt-2 text-xl font-extrabold tracking-tight text-foreground">
                  Lead-to-outbound in 5 visual steps
                </div>

                <div className="mt-6 space-y-4">
                  <TimelineStep
                    step="01"
                    title="Lead qualified"
                    subtitle="Quality checks score fit and readiness for outreach"
                  />
                  <div className="ml-3 h-4 w-px bg-border/70" />
                  <TimelineStep
                    step="02"
                    title="Account matched"
                    subtitle="Krot maps qualified leads to your ICP and account book"
                  />
                  <div className="ml-3 h-4 w-px bg-border/70" />
                  <TimelineStep
                    step="03"
                    title="Leads enriched"
                    subtitle="Contact list generated and validated for execution"
                  />
                  <div className="ml-3 h-4 w-px bg-border/70" />
                  <TimelineStep
                    step="04"
                    title="Sequence launched"
                    subtitle="Personalized email sequence starts from connected inboxes"
                  />
                  <div className="ml-3 h-4 w-px bg-border/70" />
                  <TimelineStep
                    step="05"
                    title="Responses tracked"
                    subtitle="Reply, meeting, and conversion signals feed analytics"
                  />
                </div>

                <div className="mt-6 rounded-xl border border-border bg-background/70 p-4">
                  <div className="text-xs text-muted-foreground font-medium">Roadmap outcome</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    Faster time-to-first-touch on high-intent accounts with clear pipeline attribution.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </LandingContainer>
      </section>

      {/* Why */}
      <section id="faq" className="py-16 bg-card/30 border-t border-border">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Why Teams Choose Krot
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Stop juggling disconnected tooling. Run intelligence and outbound from
            one platform built for B2B execution.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
            {versionSevenWhyItems.map((w) => (
              <div key={w.title} className="rounded-2xl border border-border bg-card/70 p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-base font-extrabold">{w.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {w.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </LandingContainer>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 border-t border-border">
        <LandingContainer>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Pricing
            </h2>
            <p className="mt-3 text-muted-foreground">
              Choose the plan that fits your team. Add extra connected email licenses anytime from inside the app.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border bg-card/70 p-6 flex flex-col h-full">
              <div className="text-sm font-semibold text-muted-foreground">Free</div>
              <div className="mt-2 text-3xl font-extrabold">$0</div>
              <div className="text-xs text-muted-foreground">per month</div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground flex-1">
                <li>- Limited email sequencing</li>
                <li>- CSV uploads</li>
                <li>- Signals access</li>
              </ul>
              <a
                href="/signup"
                className="mt-4 inline-flex w-full items-center justify-center text-center rounded-md border border-border bg-card/80 px-4 py-2 text-sm font-semibold leading-none text-foreground hover:bg-card transition-colors"
              >
                Get started
              </a>
            </div>

            <div className="rounded-2xl border border-border bg-card/70 p-6 flex flex-col h-full">
              <div className="text-sm font-semibold text-muted-foreground">Basic</div>
              <div className="mt-2 text-3xl font-extrabold">$49</div>
              <div className="text-xs text-muted-foreground">per month</div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground flex-1">
                <li>- 1 connected email</li>
                <li>- Full email sequencing</li>
                <li>- CSV uploads</li>
                <li>- Lead generation and enrichment (limited)</li>
                <li>- Signals</li>
                <li>- Add extra email licenses in-app</li>
              </ul>
              <a
                href="/signup"
                className="mt-4 inline-flex w-full items-center justify-center text-center rounded-md border border-border bg-card/80 px-4 py-2 text-sm font-semibold leading-none text-foreground hover:bg-card transition-colors"
              >
                Get started
              </a>
            </div>

            <div className="rounded-2xl border border-primary bg-card/80 p-6 shadow-[0_0_0_1px_rgba(196,160,66,0.25)] flex flex-col h-full">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-primary">Business Standard</div>
                <span className="rounded-full border border-primary/45 bg-primary/12 px-3 py-1 text-[10px] font-semibold tracking-wide text-primary/95">
                  Best value
                </span>
              </div>
              <div className="mt-2 text-3xl font-extrabold">$129</div>
              <div className="text-xs text-muted-foreground">per month</div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground flex-1">
                <li>- 3 connected emails</li>
                <li>- Full email sequencing</li>
                <li>- CSV uploads</li>
                <li>- Lead generation and enrichment (extensive limits)</li>
                <li>- Premium Signals</li>
                <li>- Automations (Zapier, CRMs, other tools)</li>
                <li>- Add extra email licenses in-app</li>
              </ul>
              <a
                href="/signup"
                className="mt-4 inline-flex w-full items-center justify-center text-center rounded-md border border-primary/45 bg-primary/15 px-4 py-2 text-sm font-semibold leading-none text-primary hover:bg-primary/20 transition-colors"
              >
                Get started
              </a>
            </div>

            <div className="rounded-2xl border border-border bg-card/70 p-6 flex flex-col h-full">
              <div className="text-sm font-semibold text-muted-foreground">Pro</div>
              <div className="mt-2 text-3xl font-extrabold">$249</div>
              <div className="text-xs text-muted-foreground">per month</div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground flex-1">
                <li>- 5 connected emails</li>
                <li>- Full email sequencing</li>
                <li>- CSV uploads</li>
                <li>- Unlimited lead generation and enrichment</li>
                <li>- Premium Signals</li>
                <li>- Early access to beta tools</li>
                <li>- Automations (Zapier, CRMs, other tools)</li>
                <li>- Add extra email licenses in-app</li>
              </ul>
              <a
                href="/signup"
                className="mt-4 inline-flex w-full items-center justify-center text-center rounded-md border border-border bg-card/80 px-4 py-2 text-sm font-semibold leading-none text-foreground hover:bg-card transition-colors"
              >
                Get started
              </a>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
            Need custom requirements or integrations? Contact{" "}
            <a
              href="mailto:sales@krot.io"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              sales@krot.io
            </a>
            .
          </div>
        </LandingContainer>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-card/30 border-t border-border">
        <LandingContainer>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              {versionSevenFaq.title}
            </h2>
            <div className="mt-2 text-muted-foreground">
              Everything you need to know about Krot and how it helps B2B teams execute signal-driven outbound.
            </div>
          </div>

          <div className="mt-8">
            <Accordion type="single" collapsible className="w-full">
              {versionSevenFaq.items.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="text-foreground font-extrabold">
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

      {/* Final CTA */}
      <section id="final-cta" className="py-16">
        <LandingContainer>
          <div className="rounded-3xl border border-border bg-card/70 p-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7">
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                  Ready to Run High-Quality Sequenced Outbound With Krot?
                </h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  Bring your ICP, connect your inboxes, and turn qualified leads into
                  personalized outbound execution from one workspace.
                </p>
              </div>

              <div className="lg:col-span-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <PrimaryCtaLink href="/signup">
                    <span className="flex items-center gap-2">
                      Register for Free <ArrowRight className="h-4 w-4" />
                    </span>
                  </PrimaryCtaLink>
                </div>

                <div className="mt-6 text-xs text-muted-foreground font-semibold">
                  Built for B2B sales, growth, and GTM teams.
                </div>
              </div>
            </div>
          </div>
        </LandingContainer>
      </section>

      <footer className="py-10 border-t border-border bg-card/60">
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
                className="inline-flex items-center rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="text-center text-sm text-muted-foreground font-semibold">
            Krot - B2B intelligence and outbound execution platform.
          </div>
        </LandingContainer>
      </footer>
      <button
        type="button"
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={cn(
          "fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-semibold text-foreground shadow-md backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-card",
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

