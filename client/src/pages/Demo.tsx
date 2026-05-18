import type { ReactNode } from "react";
import { ArrowRight, BarChart3, BellRing, Database, Mail, Search, UserRoundPlus } from "lucide-react";
import MarketingLayout, { LandingContainer } from "@/components/MarketingLayout";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { getPublicHomeUrl } from "@/const";

/** Replace with your hosted demo asset when ready. */
const DEMO_VIDEO_SRC =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

type DemoPageProps = {
  brandHomeHref?: string;
};

function DemoChromeFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-lg">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-destructive/60" />
        <span className="h-2 w-2 rounded-full bg-primary/60" />
        <span className="h-2 w-2 rounded-full bg-chart-3/60" />
        <span className="ml-2 truncate text-[10px] font-bold text-muted-foreground">{title}</span>
      </div>
      <div className="bg-background/50 p-3 sm:p-4">{children}</div>
    </div>
  );
}

function ShotContactSearch() {
  return (
    <DemoChromeFrame title="app.krot.io/search">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-primary" />
        <div className="h-2 flex-1 rounded bg-muted" />
      </div>
      <div className="mt-3 space-y-2">
        {["VP Sales · Northstar", "Head of Growth · BluePeak", "Founder · OrbitOps"].map((row) => (
          <div
            key={row}
            className="flex items-center justify-between rounded-lg border border-border/80 bg-card/70 px-3 py-2 text-[11px] font-bold text-foreground"
          >
            <span className="truncate">{row}</span>
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] text-primary">
              Save
            </span>
          </div>
        ))}
      </div>
    </DemoChromeFrame>
  );
}

function ShotSequences() {
  return (
    <DemoChromeFrame title="app.krot.io/campaigns">
      <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
        Active sequence
      </div>
      <div className="space-y-2">
        {[
          { step: "Intro", day: "Day 1", state: "Sent" },
          { step: "Signal follow-up", day: "Day 3", state: "Queued" },
          { step: "Breakup", day: "Day 7", state: "Draft" },
        ].map((row) => (
          <div
            key={row.step}
            className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black text-foreground">{row.step}</div>
              <div className="text-[10px] font-semibold text-muted-foreground">{row.day}</div>
            </div>
            <span className="text-[10px] font-bold text-primary">{row.state}</span>
          </div>
        ))}
      </div>
    </DemoChromeFrame>
  );
}

function ShotSignals() {
  return (
    <DemoChromeFrame title="app.krot.io/signals">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Funding", icon: Database },
          { label: "Hiring", icon: UserRoundPlus },
          { label: "Tech change", icon: BarChart3 },
          { label: "News", icon: BellRing },
        ].map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card/80 p-3 text-center"
          >
            <Icon className="mx-auto h-5 w-5 text-primary" />
            <div className="mt-2 text-[11px] font-black text-foreground">{label}</div>
            <div className="mt-0.5 text-[9px] font-semibold text-muted-foreground">Fresh</div>
          </div>
        ))}
      </div>
    </DemoChromeFrame>
  );
}

function ShotAnalytics() {
  return (
    <DemoChromeFrame title="app.krot.io/app">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase text-muted-foreground">This week</div>
          <div className="text-lg font-black text-foreground">Replies · 21%</div>
        </div>
        <div className="flex h-12 items-end gap-1">
          {[40, 55, 48, 72, 64, 80].map((h, i) => (
            <div key={i} className="w-2 rounded-sm bg-primary/25" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["128", "Saved"],
          ["24", "Signals"],
          ["46", "Meetings"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg border border-border bg-muted/30 py-2">
            <div className="text-sm font-black text-foreground">{v}</div>
            <div className="text-[9px] font-bold uppercase text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
    </DemoChromeFrame>
  );
}

const demoTestimonials = [
  {
    quote:
      "We replaced three tabs with one workspace. Reps actually run sequences now instead of debating which list is current.",
    name: "Mira Ashford",
    role: "Head of Revenue",
    company: "Northbridge Analytics",
  },
  {
    quote:
      "Signals next to the contact record changed our reply rate. Context is right there when someone opens the thread.",
    name: "Jordan Okonkwo",
    role: "Growth Lead",
    company: "Veldt Systems",
  },
  {
    quote:
      "Agency clients see the same pipeline view we do. Onboarding took an afternoon, not a sprint planning week.",
    name: "Sofia Lindgren",
    role: "Partner Director",
    company: "Harbor & Row Consulting",
  },
  {
    quote:
      "Hiring triggers plus a tight sequence template is our bread and butter. Krot keeps both in one place.",
    name: "Eli Navarro",
    role: "Managing Partner",
    company: "Brightline Talent Partners",
  },
  {
    quote:
      "Audit-friendly roles without slowing sellers down. That balance was hard to find before we moved outbound here.",
    name: "Priya Menon",
    role: "VP Sales Operations",
    company: "Cartograph Commerce",
  },
  {
    quote:
      "CSV days are behind us. Search, save, sequence—my team describes the flow in three verbs on purpose.",
    name: "Theo Brennan",
    role: "Commercial Director",
    company: "Keystone Industrial Supply",
  },
] as const;

const showcase = [
  {
    title: "Contact search",
    text: "Filter the database, save people, and push them into a sequence in a few clicks.",
    node: <ShotContactSearch />,
  },
  {
    title: "Sequences",
    text: "Multi-step flows with clear timing so the whole team sees what is live and what is next.",
    node: <ShotSequences />,
  },
  {
    title: "Signals",
    text: "Funding, hiring, stack changes, and news surface next to accounts so timing stays sharp.",
    node: <ShotSignals />,
  },
  {
    title: "Workspace analytics",
    text: "Replies, pipeline movement, and weekly outcomes stay visible without exporting to a BI tool.",
    node: <ShotAnalytics />,
  },
];

function DemoTestimonialsCarousel() {
  return (
    <section className="mt-20" aria-labelledby="demo-testimonials-heading">
      <div className="max-w-2xl">
        <h2
          id="demo-testimonials-heading"
          className="text-xs font-black uppercase tracking-[0.28em] text-primary"
        >
          Testimonials
        </h2>
        <p className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          What teams say about the workflow.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Placeholder quotes and titles for layout—swap with real customers when you have approvals.
        </p>
      </div>

      <Carousel
        opts={{ align: "start", loop: true }}
        className="mt-10 w-full"
      >
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-4">
          <CarouselPrevious
            variant="outline"
            className="static top-auto order-2 left-auto right-auto mx-auto mt-0 size-10 shrink-0 translate-x-0 translate-y-0 rounded-xl border-border shadow-sm sm:order-none sm:mx-0 sm:self-center"
          />
          <div className="order-1 min-h-0 min-w-0 flex-1 sm:order-none">
            <CarouselContent className="-ml-2 sm:-ml-4">
              {demoTestimonials.map((t) => (
                <CarouselItem key={t.name} className="pl-2 sm:pl-4">
                <figure className="flex h-full flex-col rounded-3xl border border-border bg-card/70 p-6 shadow-sm backdrop-blur sm:p-8">
                  <blockquote className="text-base font-semibold leading-relaxed text-foreground sm:text-lg">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-6 border-t border-border/80 pt-5">
                    <div className="text-sm font-black text-foreground">{t.name}</div>
                    <div className="mt-1 text-xs font-semibold text-muted-foreground sm:text-sm">
                      {t.role}, {t.company}
                    </div>
                  </figcaption>
                </figure>
              </CarouselItem>
            ))}
          </CarouselContent>
          </div>
          <CarouselNext
            variant="outline"
            className="static top-auto order-3 left-auto right-auto mx-auto mt-0 size-10 shrink-0 translate-x-0 translate-y-0 rounded-xl border-border shadow-sm sm:order-none sm:mx-0 sm:self-center"
          />
        </div>
      </Carousel>
    </section>
  );
}

export default function DemoPage({ brandHomeHref = getPublicHomeUrl() }: DemoPageProps) {
  return (
    <MarketingLayout brandHomeHref={brandHomeHref}>
      <main className="pt-32 pb-16 sm:pt-36 sm:pb-20">
        <LandingContainer>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">Demo</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            See Krot in motion.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Watch a short walkthrough of search, sequences, and signals—then browse stylized captures
            of the workspace. Replace the sample clip with your own recording when the file is ready.
          </p>

          <section className="mt-12" aria-labelledby="demo-video-heading">
            <h2 id="demo-video-heading" className="sr-only">
              Product demo video
            </h2>
            <div className="overflow-hidden rounded-3xl border border-border bg-card/80 shadow-xl shadow-primary/5">
              <video
                className="aspect-video w-full bg-black/90 object-cover"
                controls
                playsInline
                preload="metadata"
              >
                <source src={DEMO_VIDEO_SRC} type="video/mp4" />
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Your browser does not support embedded video.{" "}
                  <a href={DEMO_VIDEO_SRC} className="font-semibold text-primary underline">
                    Download the sample clip
                  </a>
                  .
                </p>
              </video>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Placeholder clip (CC0) for layout—replace with your product walkthrough.
            </p>
          </section>

          <section className="mt-20" aria-labelledby="demo-shots-heading">
            <div className="max-w-2xl">
              <h2
                id="demo-shots-heading"
                className="text-xs font-black uppercase tracking-[0.28em] text-primary"
              >
                Product captures
              </h2>
              <p className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                What the workspace feels like day to day.
              </p>
              <p className="mt-3 text-muted-foreground">
                Lightweight previews of the flows prospects see in a live workspace—swap in PNG or WebP
                under <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">public/</code>{" "}
                when you have final marketing shots.
              </p>
            </div>

            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              {showcase.map((item) => (
                <article
                  key={item.title}
                  className="flex flex-col gap-4 rounded-3xl border border-border bg-card/60 p-5 backdrop-blur sm:p-6"
                >
                  <div>
                    <h3 className="text-xl font-black text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                  <div>{item.node}</div>
                </article>
              ))}
            </div>
          </section>

          <DemoTestimonialsCarousel />

          <div className="mt-16 flex flex-wrap gap-3">
            <a
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 transition hover:-translate-y-0.5 hover:opacity-90"
            >
              Register for free <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            <a
              href={`${brandHomeHref}#product`}
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card/75 px-5 py-3 text-sm font-bold text-foreground transition hover:-translate-y-0.5 hover:bg-card"
            >
              Back to product overview
            </a>
          </div>
        </LandingContainer>
      </main>
    </MarketingLayout>
  );
}
