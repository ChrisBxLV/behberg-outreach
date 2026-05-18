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
    <div className={cn("mx-auto w-full max-w-7xl px-3.5 sm:px-6", className)}>
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
            <div
              className={cn(
                "flex w-full min-w-0 items-center justify-between gap-x-2",
                "max-lg:flex-nowrap max-lg:gap-y-0 max-lg:py-2",
                "lg:flex-wrap lg:gap-x-4 lg:gap-y-3 lg:py-[1.125rem]",
              )}
            >
              <a
                href={brandHomeHref}
                className="flex shrink-0 items-center gap-2 rounded-xl outline-offset-4 transition-opacity hover:opacity-90 max-lg:gap-1.5 lg:gap-2.5"
              >
                <img
                  src="/krot-mole-logo.svg"
                  alt="Krot emailing software logo, golden mole mascot"
                  className="h-8 w-auto shrink-0 select-none lg:h-10"
                />
                <span className="text-sm font-black tracking-tight text-primary lg:text-lg">
                  krot.io
                </span>
              </a>

              <nav
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-end gap-x-0.5 lg:flex-none",
                  "max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:[-webkit-overflow-scrolling:touch] max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden",
                )}
              >
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
                      "shrink-0 touch-manipulation rounded-lg font-semibold tracking-tight text-muted-foreground transition-colors duration-200",
                      "hover:bg-muted/55 hover:text-foreground active:bg-muted/70",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "max-lg:px-2 max-lg:py-1.5 max-lg:text-xs",
                      "lg:rounded-xl lg:px-4 lg:py-3 lg:text-[0.9375rem]",
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
                      "ml-0.5 inline-flex shrink-0 touch-manipulation items-center justify-center rounded-lg border border-border/80",
                      "bg-background/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground active:bg-muted/60",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "max-lg:h-8 max-lg:w-8",
                      "lg:ml-1 lg:h-11 lg:w-11 lg:rounded-xl",
                    )}
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4 lg:h-5 lg:w-5" />
                    ) : (
                      <Moon className="h-4 w-4 lg:h-5 lg:w-5" />
                    )}
                  </button>
                ) : null}
                <a
                  href="/login"
                  className={cn(
                    "ml-1 inline-flex shrink-0 touch-manipulation items-center justify-center rounded-lg border border-primary/45",
                    "bg-primary/[0.09] font-semibold tracking-tight text-primary transition-colors duration-200",
                    "hover:bg-primary/15 hover:text-primary active:bg-primary/20",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "max-lg:px-3 max-lg:py-1.5 max-lg:text-xs",
                    "lg:ml-2 lg:rounded-xl lg:px-5 lg:py-3 lg:text-[0.9375rem]",
                  )}
                >
                  Log in
                </a>
              </nav>
            </div>
          </LandingContainer>
        </header>

        {children}

        <footer className="border-t border-border bg-card/65 py-8 sm:py-10">
          <LandingContainer>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2 px-0.5 sm:px-0">
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
            <div className="mt-3 flex flex-col items-stretch gap-y-1 text-center text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-4 sm:gap-y-2">
              <a
                href="/privacy"
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-2 py-2 font-semibold underline underline-offset-4 hover:bg-muted/40 hover:text-foreground sm:min-h-0 sm:inline sm:py-0"
              >
                Privacy Policy
              </a>
              <a
                href="/privacy/remove"
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-2 py-2 text-center font-semibold underline underline-offset-4 hover:bg-muted/40 hover:text-foreground sm:min-h-0 sm:inline sm:py-0"
              >
                Do not contact / Opt-out request
              </a>
              <button
                type="button"
                onClick={openCookiePreferences}
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-2 py-2 font-semibold underline underline-offset-4 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:inline sm:py-0"
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
            "fixed z-40 inline-flex touch-manipulation items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-bold text-foreground shadow-md backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-card",
            "bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] right-[max(1.5rem,env(safe-area-inset-right,0px))] max-lg:px-3 max-lg:py-2.5",
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
