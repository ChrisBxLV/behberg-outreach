import MarketingLayout, { LandingContainer } from "@/components/MarketingLayout";
import { getPublicHomeUrl } from "@/const";
import { versionSevenFounders } from "./versionSevenLandingData";

type AboutPageProps = {
  brandHomeHref?: string;
};

export default function AboutPage({ brandHomeHref = getPublicHomeUrl() }: AboutPageProps) {
  return (
    <MarketingLayout brandHomeHref={brandHomeHref}>
      <main className="pt-28 pb-16 sm:pt-32">
        <LandingContainer>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">Team</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Built by operators.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            We have run outbound, hiring, and agency pipelines ourselves. Krot reflects what we wished
            our tools had prioritized: fewer tabs, clearer next steps, and less busywork between
            intent and send.
          </p>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {versionSevenFounders.map((founder) => (
              <article
                key={founder.name + founder.role}
                className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur"
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
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{founder.bio}</p>
              </article>
            ))}
          </div>
        </LandingContainer>
      </main>
    </MarketingLayout>
  );
}
