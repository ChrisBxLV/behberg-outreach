import { useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Play,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  versionSevenAddOns,
  versionSevenCaseStudies,
  versionSevenFaq,
  versionSevenFeatures,
  versionSevenMetrics,
  versionSevenTestimonials,
  versionSevenWhyItems,
} from "./versionSevenLandingData";

type LandingReplicaProps = {
  primaryCtaHref: string;
<<<<<<< HEAD
  /** Admin / app sign-in (keep low-profile on the public site). */
  signInHref?: string;
  /** Public workspace/org creation entrypoint. */
  signUpHref?: string;
=======
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
};

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
  href,
}: {
  title: string;
  subtitle: string;
  outcome: string;
  metrics: string[];
  href?: string;
}) {
  const metricsText = useMemo(() => metrics.slice(0, 2), [metrics]);

  return (
    <a
      href={href}
      className="group block rounded-xl border border-border bg-card/70 p-6 hover:shadow-sm hover:border-primary/40 transition-shadow"
    >
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
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        Read case study <ArrowRight className="h-4 w-4" />
      </div>
    </a>
  );
}

function TimelineStep({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-primary/20" />
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {subtitle ? <div className="text-xs text-muted-foreground mt-1">{subtitle}</div> : null}
    </div>
  );
}

export default function VersionSevenLandingReplica({
  primaryCtaHref,
<<<<<<< HEAD
  signInHref = "/login",
  signUpHref = "/signup",
=======
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
}: LandingReplicaProps) {
  const ctaHref = primaryCtaHref;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top offer bar */}
      <div className="border-b border-border bg-card/70 backdrop-blur">
        <LandingContainer>
          <div className="py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
            <div className="font-semibold">
              Krot: B2B intelligence + signal-driven outbound from connected inboxes.
            </div>
<<<<<<< HEAD
            <div className="flex items-center gap-2">
              <a
                href={signUpHref}
                className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
              >
                Sign up
              </a>
              <a
                href={signInHref}
                className="inline-flex items-center rounded-md border border-border/80 bg-background/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                Sign in
              </a>
            </div>
=======
            <a
              href="/app"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              Open workspace <ArrowRight className="h-4 w-4" />
            </a>
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
          </div>
        </LandingContainer>
      </div>

      {/* Hero */}
      <section className="py-16">
        <LandingContainer>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-sm font-semibold">
                <span className="text-primary">Krot</span>
                <span>Revenue Intelligence Platform</span>
                <span className="text-muted-foreground font-medium">
                  built for B2B teams
                </span>
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.05]">
                Turn B2B Signals Into Qualified Pipeline With Krot
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-muted-foreground max-w-xl">
                Krot combines lead generation, news signals, and inbox-native email
                sequencing in one operating system. Spot opportunity early, launch
                personalized outreach fast, and keep your team focused on high-intent
                accounts.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <PrimaryCtaLink href={ctaHref}>
                  <span className="flex items-center gap-2">
                    Start Your Trial <ArrowRight className="h-4 w-4" />
                  </span>
                </PrimaryCtaLink>
                <SecondaryCtaLink href="#">
                  <span className="flex items-center gap-2">
                    Watch Platform Overview <Play className="h-4 w-4" />
                  </span>
                </SecondaryCtaLink>
              </div>

<<<<<<< HEAD
              <p className="mt-4 text-sm text-muted-foreground">
                Workspace:{" "}
                <a
                  href={signUpHref}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Sign up
                </a>{" "}
                (new organization) or{" "}
                <a
                  href={signInHref}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Sign in
                </a>
                .
              </p>

=======
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground">
                <span>Lead generation built in</span>
                <span>Connected inbox sequencing</span>
                <span>News signal monitoring</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-border bg-card/70 p-6">
                <div className="aspect-[16/10] rounded-xl border border-border bg-background flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(196,160,66,0.18),transparent_55%)]" />
                  <div className="relative text-center px-6">
                    <div className="text-sm font-semibold text-muted-foreground">
                      Workspace preview
                    </div>
                    <div className="mt-2 text-lg font-bold text-foreground">
                      Signal feed, lead generation, and sequencing in one screen.
                    </div>
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/35 px-5 py-3 text-sm font-semibold text-foreground">
                      View product flow <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Watch demo"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:shadow-md transition-shadow"
                  >
                    <Play className="h-6 w-6 text-foreground" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {["Total Leads", "Meetings Booked"].map((k) => (
                    <div
                      key={k}
                      className="rounded-xl bg-card/80 border border-border p-3 text-left"
                    >
                      <div className="text-xs text-muted-foreground font-medium">{k}</div>
                      <div className="mt-1 text-base font-bold text-foreground">
                        {k === "Total Leads" ? "889" : "+13"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Note: this repo replica uses a placeholder demo panel. Replace with your real screenshot/video for pixel-perfect matching.
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
      <section className="py-16 bg-card/30 border-y border-border">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            See How Teams Use Krot
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            From intelligence-led account prioritization to faster outbound execution,
            here is how teams operationalize Krot.
          </p>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {versionSevenCaseStudies.map((cs) => (
              <CaseStudyCard key={cs.title} {...cs} />
            ))}
          </div>

          <div className="mt-8 text-center">
            <a
              href="https://www.versionseven.ai/case-studies"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-6 py-3 font-semibold hover:bg-card transition-colors"
            >
              View All Case Studies <ArrowRight className="h-4 w-4" />
            </a>
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
<<<<<<< HEAD
                  "{t.quote}"
=======
                  “{t.quote}”
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
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
                From Signal Detection to Sequenced Outreach
              </div>
              <div className="mt-4 text-muted-foreground leading-relaxed">
                Monitor market events, identify matched accounts, enrich contacts,
                and launch inbox-native sequences with AI-assisted personalization.
              </div>

              <div className="mt-6 space-y-3">
                {[
                  "Track funding, M&A, and other account-level intent signals.",
                  "Generate and enrich leads directly from your ICP.",
                  "Activate personalized sequences from connected user inboxes.",
                ].map((x) => (
                  <div key={x} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm font-semibold text-foreground">{x}</div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <PrimaryCtaLink href={ctaHref}>
                  <span className="flex items-center gap-2">
                    Start Your Trial <ArrowRight className="h-4 w-4" />
                  </span>
                </PrimaryCtaLink>
                <a
                  href="https://www.versionseven.ai/pipeline-accelerator"
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-card/70 text-foreground font-semibold px-5 py-3 hover:bg-card transition-colors"
                >
                    Explore Signal Workflows
                </a>
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
            Layer in specialized workflows for signal routing, lead intelligence, and
            inbox orchestration as your motion scales.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            {versionSevenAddOns.map((a) => (
              <a
                key={a.title}
                href={a.href}
                className="block rounded-2xl border border-border bg-card/70 p-7 hover:shadow-sm hover:border-primary/40 transition-shadow"
              >
                <div className="text-lg font-extrabold text-foreground">{a.title}</div>
                <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.description}</div>
                <div className="mt-6 inline-flex items-center gap-2 font-semibold text-foreground">
                  {a.cta} <ArrowRight className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>
        </LandingContainer>
      </section>

      {/* Features + timeline */}
      <section className="py-16">
        <LandingContainer>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            How Krot Turns Intelligence Into Pipeline
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Lead generation, news signal detection, sequence automation, and analytics
            designed to help B2B teams prioritize and execute with precision.
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
                <div className="text-sm font-semibold text-muted-foreground">Signal Workflow</div>
                <div className="mt-2 text-xl font-extrabold tracking-tight text-foreground">
                  Intelligence-to-outbound automation
                </div>

                <div className="mt-6 space-y-5">
                  <TimelineStep title="Signal captured" subtitle="Funding, M&A, leadership, or market event detected" />
                  <TimelineStep title="Account matched" subtitle="Krot maps signal to your ICP and account book" />
                  <TimelineStep title="Leads enriched" subtitle="Contact list generated and validated for execution" />
                  <TimelineStep title="Sequence launched" subtitle="Personalized email sequence starts from connected inboxes" />
                  <TimelineStep title="Responses tracked" subtitle="Reply, meeting, and conversion signals feed analytics" />
                </div>

                <div className="mt-6 rounded-xl border border-border bg-background/70 p-4">
                  <div className="text-xs text-muted-foreground font-medium">Execution outcome</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    Faster time-to-first-touch on high-intent accounts with clearer pipeline attribution.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </LandingContainer>
      </section>

      {/* Why */}
      <section className="py-16 bg-card/30 border-t border-border">
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
      <section className="py-16">
        <LandingContainer>
          <div className="rounded-3xl border border-border bg-card/70 p-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7">
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                  Ready to Run Signal-Driven Outbound With Krot?
                </h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  Bring your ICP, connect your inboxes, and turn live market signals
                  into personalized outbound execution from one workspace.
                </p>
              </div>

              <div className="lg:col-span-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <PrimaryCtaLink href={ctaHref}>
                    <span className="flex items-center gap-2">
                      Start Your Trial <ArrowRight className="h-4 w-4" />
                    </span>
                  </PrimaryCtaLink>
                  <a
                    href="https://www.versionseven.ai/pipeline-accelerator"
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-card/70 text-foreground font-semibold px-5 py-3 hover:bg-card transition-colors"
                  >
                    Book Product Walkthrough
                  </a>
                </div>

                <div className="mt-4 text-sm text-muted-foreground">
                  Need a deeper dive?{" "}
                  <a
                    href="https://calendly.com/alexleischow/victoria-ai-onboarding-call"
                    className="font-semibold underline underline-offset-4 hover:text-foreground"
                  >
                    Schedule a guided tour
                  </a>{" "}
<<<<<<< HEAD
                  {"->"}
=======
                  →
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
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
          <div className="text-center text-sm text-muted-foreground font-semibold">
            Krot - B2B intelligence and outbound execution platform.
          </div>
        </LandingContainer>
      </footer>
    </div>
  );
}

