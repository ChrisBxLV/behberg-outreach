import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, countryNameFromCode } from "@/lib/countries";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Onboarding() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");

  const requirePhoneAndCountry = (): boolean => {
    const p = phone.trim();
    if (p.length < 4) {
      toast.error("Enter a valid phone number to continue.");
      return false;
    }
    if (!country.trim()) {
      toast.error("Select a country to continue.");
      return false;
    }
    return true;
  };

  const complete = trpc.auth.completeOnboarding.useMutation({
    onSuccess: async () => {
      toast.success("Saved.");
      setLocation("/app");
    },
    onError: e => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requirePhoneAndCountry()) return;
    complete.mutate({ phone: phone.trim(), country: country.trim().toUpperCase() });
  };

  const busy = complete.isPending;
  const alreadyComplete = Boolean(user?.phone && user?.country);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Finish setup</CardTitle>
          <CardDescription>
            Please add your phone number and country to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alreadyComplete ? (
            <>
              <p className="text-sm text-muted-foreground">You’re all set.</p>
              <Button className="w-full" type="button" onClick={() => setLocation("/app")}>
                Go to dashboard
              </Button>
            </>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  required
                  minLength={4}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Country</label>
                <Select value={country} onValueChange={setCountry} disabled={busy}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder="Select a country"
                    >
                      {country ? `${country.toUpperCase()} — ${countryNameFromCode(country) ?? "Unknown"}` : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="country" value={country} required />
              </div>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

