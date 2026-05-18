import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useCookieConsent } from "@/contexts/CookieConsentContext";

const COPY =
  "Krot and its partners use cookies and similar technologies to keep our website working, improve your experience, analyze usage, and understand how visitors interact with our services.\n\n" +
  "You can manage your cookie preferences at any time. Some cookies are strictly necessary for the website to function, while others help us improve performance, remember your preferences, or support marketing and analytics.\n\n" +
  "If you disable some cookies, certain features of our website or service may not work as expected.";

function LogoRow() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/krot-mole.png"
        alt="Krot"
        className="h-18 w-18 shrink-0 select-none rounded-full object-cover pointer-events-none"
        draggable={false}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-wide text-primary">krot.io</span>
        <span className="text-xs text-muted-foreground">Cookie consent</span>
      </div>
    </div>
  );
}

export function CookieConsentModal() {
  const { isModalOpen, closeModal, consent, save, allowAll, rejectAll } = useCookieConsent();

  const initial = useMemo(
    () => ({
      performance: consent?.performance ?? false,
      functional: consent?.functional ?? false,
      targeting: consent?.targeting ?? false,
    }),
    [consent],
  );

  const [draft, setDraft] = useState(initial);

  // Keep draft aligned when re-opening modal after a save elsewhere.
  // We only update when modal opens so we don’t overwrite the user’s in-progress changes.
  useEffect(() => {
    if (!isModalOpen) return;
    setDraft(initial);
  }, [initial, isModalOpen]);

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => (open ? null : closeModal())}>
      <DialogContent
        className={[
          "p-0 overflow-hidden flex flex-col",
          "max-w-[calc(100%-1.25rem)] sm:max-w-3xl",
          "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]",
          "bg-card text-card-foreground border-border",
          "shadow-2xl",
        ].join(" ")}
      >
        <div className="p-5 sm:p-6 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <LogoRow />
          </div>
          {/* Close button is provided by DialogContent */}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-[1.15fr_0.85fr] gap-6">
          <div className="min-w-0">
            <DialogTitle className="text-lg sm:text-xl font-semibold text-foreground">
              Manage Consent Preferences
            </DialogTitle>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {COPY}
            </p>

            <a
              href="/privacy"
              className="inline-flex mt-4 text-sm font-medium text-primary hover:opacity-90 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              More information
            </a>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Strictly Necessary Cookies
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Required for the website to function.
                  </p>
                </div>
                <span className="text-xs font-semibold text-foreground bg-background border border-border px-2 py-1 rounded-full shrink-0">
                  Always Active
                </span>
              </div>

              <div className="h-px bg-border" />

              {[
                {
                  key: "performance" as const,
                  title: "Performance Cookies",
                  desc: "Help us understand usage and improve performance.",
                },
                {
                  key: "functional" as const,
                  title: "Functional Cookies",
                  desc: "Remember settings and improve your experience.",
                },
                {
                  key: "targeting" as const,
                  title: "Targeting Cookies",
                  desc: "Support marketing and relevant measurement.",
                },
              ].map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{row.desc}</p>
                  </div>
                  <Switch
                    checked={draft[row.key]}
                    onCheckedChange={(checked) =>
                      setDraft((d) => ({ ...d, [row.key]: checked }))
                    }
                    aria-label={row.title}
                    className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>

        <div className="p-5 sm:p-6 border-t border-border bg-card">
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => rejectAll()}
                className="border-border"
              >
                Reject All
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => allowAll()}
                className="border-border"
              >
                Allow All
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => save(draft)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm focus-visible:ring-ring"
            >
              Save Settings
            </Button>
          </div>
          <div className="h-[max(0px,env(safe-area-inset-bottom))]" aria-hidden />
        </div>
      </DialogContent>
    </Dialog>
  );
}

