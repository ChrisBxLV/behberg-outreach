import { CheckCircle2 } from "lucide-react";
import MarketingLayout, { LandingContainer } from "@/components/MarketingLayout";
import { getPublicHomeUrl } from "@/const";
import { cn } from "@/lib/utils";
import { marketingPricingPlans } from "./marketingPricingPlans";

function ScorePill({ value }: { value: string }) {
  return (
    <span className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-primary/40 bg-primary/12 px-3.5 py-1.5 text-center text-[11px] font-bold leading-none text-primary">
      {value}
    </span>
  );
}

type PricingPageProps = {
  brandHomeHref?: string;
};

export default function PricingPage({ brandHomeHref = getPublicHomeUrl() }: PricingPageProps) {
  return (
    <MarketingLayout brandHomeHref={brandHomeHref}>
      <main className="pt-28 pb-16 sm:pt-32">
        <LandingContainer>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">Pricing</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Choose the right plan.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Start free, then scale mailboxes, signals, and analytics as volume grows. Every tier keeps
            the same focused workflow—only capacity and depth change.
          </p>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {marketingPricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "flex h-full flex-col rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur",
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
                      : "border-border bg-background/70 text-foreground",
                  )}
                >
                  Get started
                </a>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-card/70 p-4 text-sm font-semibold text-muted-foreground backdrop-blur">
            Need custom integrations? Contact{" "}
            <a href="mailto:sales@krot.io" className="text-foreground underline underline-offset-4">
              sales@krot.io
            </a>
            .
          </div>
        </LandingContainer>
      </main>
    </MarketingLayout>
  );
}
