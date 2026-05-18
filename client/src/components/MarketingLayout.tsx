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
      <DataParticlesBackground />
      <div className="relative z-10">
        <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
          <LandingContainer>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 sm:py-[1.125rem]">
              <a
                href={brandHomeHref}
                className="flex items-center gap-2.5 rounded-xl outline-offset-4 transition-opacity hover:opacity-90"
              >
                <img
                  src="/logoipsum-294.svg"
                  alt="Krot"
                  className="h-9 w-auto select-none sm:h-10"
                />
                <span className="text-base font-black tracking-tight text-primary sm:text-lg">
                  krot.io
                </span>
              </a>

              <nav className="flex flex-wrap items-center gap-x-0.5 gap-y-1 sm:gap-x-1">
                {(
                  [
                    ["Product", `${brandHomeHref}#product`],
                    ["Demo", "/demo"],
                    ["About", "/about"],
                    ["Pricing", `${brandHomeHref}#pricing`],
                    ["FAQ", `${brandHomeHref}#faq`],
                  ] as const
                ).map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    className={cn(
                      "rounded-xl px-3.5 py-2.5 text-sm font-semibold tracking-tight text-muted-foreground",
                      "transition-colors duration-200 hover:bg-muted/55 hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "sm:px-4 sm:py-3 sm:text-[0.9375rem]",
                    )}
                  >
                    {label}
                  </a>
                ))}
                {switchable && toggleTheme ? (
                  <button
                    type="button"
                    onClick={(event) => toggleTheme?.(event)}
                    className={cn(
                      "ml-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80",
                      "bg-background/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "sm:ml-1 sm:h-11 sm:w-11",
                    )}
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />
                    ) : (
                      <Moon className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />
                    )}
                  </button>
                ) : null}
                <a
                  href="/login"
                  className={cn(
                    "ml-1 inline-flex items-center justify-center rounded-xl border border-primary/45",
                    "bg-primary/[0.09] px-4 py-2.5 text-sm font-semibold tracking-tight text-primary",
                    "transition-colors duration-200 hover:bg-primary/15 hover:text-primary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "sm:ml-2 sm:px-5 sm:py-3 sm:text-[0.9375rem]",
                  )}
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
