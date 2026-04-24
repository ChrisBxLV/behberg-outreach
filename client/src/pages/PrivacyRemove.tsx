import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPublicHomeUrl } from "@/const";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Step = "start" | "verify" | "done";

export default function PrivacyRemove() {
  const [location, setLocation] = useLocation();
  const initialEmail = useMemo(() => {
    const query = location.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    return (params.get("email") ?? "").trim().toLowerCase();
  }, [location]);

  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !value.includes("@")) {
      toast.error("Enter a valid work email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/optout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) {
        toast.error("Could not start request. Try again.");
        return;
      }
      toast.success("If this email can be verified, a code was sent.");
      setStep("verify");
      setCode("");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start request.");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    const c = code.trim();
    if (!value || !value.includes("@")) {
      toast.error("Enter a valid work email.");
      return;
    }
    if (!/^\d{6}$/.test(c)) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/optout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, code: c }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; reason?: string }
        | null;

      if (!res.ok) {
        toast.error("Could not verify code. Try again.");
        return;
      }
      if (data?.success) {
        toast.success("Opt-out confirmed.");
        setStep("done");
        return;
      }
      if (data?.reason === "expired") {
        toast.error("Code expired. Request a new one.");
        return;
      }
      if (data?.reason === "too_many_attempts") {
        toast.error("Too many attempts. Request a new code.");
        return;
      }
      toast.error("Invalid code. Request a new one.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not verify code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4 bg-background text-foreground">
      <div className="w-full max-w-md flex justify-start">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => setLocation(getPublicHomeUrl())}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to home
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p className="text-lg font-bold tracking-tight text-foreground">
              We Respect Your Privacy
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You have control over how your business information is used. If you are a California
              resident, the CCPA gives you the right to opt out of the sale of your business
              information. If you are in the EEA, the UK, or Switzerland, the GDPR and similar laws
              give you the right to object to our processing of your business data.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">Do not contact</p>
              <p className="text-xs text-muted-foreground">
                Request to stop outreach from this sender mailbox. We’ll email a 6-digit code to confirm.
              </p>
            </div>

            <div className="mt-4">
              {step === "done" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You will no longer receive outreach from this sender mailbox at{" "}
                    <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>.
                  </p>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setLocation(getPublicHomeUrl())}
                  >
                    Back to home
                  </Button>
                </div>
              ) : step === "start" ? (
                <form className="space-y-4" onSubmit={onStart}>
                  <Input
                    type="email"
                    placeholder="Work email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    disabled={busy}
                  />
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Sending…" : "Get verification code"}
                  </Button>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={onVerify}>
                  <Input
                    type="email"
                    placeholder="Work email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={busy}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                    disabled={busy}
                  />
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Verifying…" : "Confirm opt-out"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    disabled={busy}
                    onClick={() => {
                      setStep("start");
                      setCode("");
                    }}
                  >
                    Request a new code
                  </Button>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

