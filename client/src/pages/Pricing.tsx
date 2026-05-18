import MarketingLayout, { LandingContainer } from "@/components/MarketingLayout";
import MarketingPricingPlansGrid from "@/components/MarketingPricingPlansGrid";
import { getPublicHomeUrl } from "@/const";

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
            Choose the plan that fits your team.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Add connected email licenses anytime from inside the app. Higher tiers unlock more
            enrichments, signal depth, automations, and analytics—without changing how your team
            works day to day.
          </p>

          <MarketingPricingPlansGrid className="mt-10" />
        </LandingContainer>
      </main>
    </MarketingLayout>
  );
}
