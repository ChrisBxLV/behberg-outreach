import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { marketingPricingPlans } from "@/pages/marketingPricingPlans";

function ScorePill({ value }: { value: string }) {
  return (
    <span className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-primary/40 bg-primary/12 px-3.5 py-1.5 text-center text-[11px] font-bold leading-none text-primary">
      {value}
    </span>
  );
}

type MarketingPricingPlansGridProps = {
  className?: string;
  gridClassName?: string;
};

export default function MarketingPricingPlansGrid({
  className,
  gridClassName,
}: MarketingPricingPlansGridProps) {
  return (
    <div className={className}>
      <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-5", gridClassName)}>
        {marketingPricingPlans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              "flex h-full flex-col rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur sm:p-6",
              plan.highlight ? "border-primary shadow-sm shadow-primary/20" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={cn(
                  "text-sm font-black",
                  plan.highlight ? "text-primary" : "text-foreground",
                )}
              >
                {plan.name}
              </div>
              {plan.highlight ? <ScorePill value="Popular" /> : null}
            </div>
            <div className="mt-3 text-4xl font-black tracking-tight text-foreground">{plan.price}</div>
            {plan.periodNote ? (
              <div className="mt-1 text-xs font-semibold text-muted-foreground">{plan.periodNote}</div>
            ) : null}
            <div className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {plan.label}
            </div>
            <ul className="mt-5 flex-1 space-y-2.5 text-pretty text-sm font-semibold leading-snug text-muted-foreground">
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
                "mt-6 inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black transition hover:-translate-y-0.5",
                plan.highlight
                  ? "border-primary/45 bg-primary/15 text-primary hover:bg-primary/20"
                  : "border-border bg-background/70 text-foreground hover:bg-background",
              )}
            >
              Get started
            </a>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4 text-sm font-semibold text-muted-foreground backdrop-blur">
        Need custom requirements or integrations? Contact{" "}
        <a href="mailto:sales@krot.io" className="text-foreground underline underline-offset-4">
          sales@krot.io
        </a>
        .
      </div>
    </div>
  );
}
