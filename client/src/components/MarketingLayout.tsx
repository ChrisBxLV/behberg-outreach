import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp, Moon, Sun } from "lucide-react";
import DataParticlesBackground from "@/components/DataParticlesBackground";
import { useCookieConsent } from "@/contexts/CookieConsentContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getPublicHomeUrl } from "@/const";
import { cn } from "@/lib/utils";

export function LandingContainer({
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

type MarketingLayoutProps = {
  /** Header logo + home link (e.g. `/` vs `/home`). */
  brandHomeHref?: string;
  children: ReactNode;
};

export default function MarketingLayout({
  brandHomeHref = getPublicHomeUrl(),
  children,
}: MarketingLayoutProps) {
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
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
        <div className="absolute -right-8 top-0 h-[min(52vh,26rem)] w-[min(60vw,30rem)] rounded-full bg-gradient-to-bl from-primary/30 via-primary/10 to-transparent blur-3xl opacity-90" />
        <div className="absolute -left-12 bottom-0 h-[min(42vh,20rem)] w-[min(55vw,26rem)] rounded-full bg-gradient-to-tr from-primary/22 via-primary/5 to-transparent blur-3xl opacity-80" />
      </div>
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
                <a href={`${brandHomeHref}#product`} className="transition hover:text-foreground">
                  Product
                </a>
                <a href="/about" className="transition hover:text-foreground">
                  Team
                </a>
                <a href="/pricing" className="transition hover:text-foreground">
                  Pricing
                </a>
                <a href={`${brandHomeHref}#faq`} className="transition hover:text-foreground">
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

        {children}

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
