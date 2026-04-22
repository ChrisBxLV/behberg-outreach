import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FirebaseAuthOptions } from "@/components/FirebaseAuthOptions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLoginUrl, getPublicHomeUrl } from "@/const";
import { COUNTRIES, countryNameFromCode } from "@/lib/countries";
import { isFirebaseClientConfigured } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function SignUp() {
  const [, setLocation] = useLocation();
  const [organizationName, setOrganizationName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  const { data: loginOpts } = trpc.auth.loginOptions.useQuery();
  const showFirebase = Boolean(loginOpts?.firebaseSignInEnabled) && isFirebaseClientConfigured();

  const register = trpc.auth.registerOrganization.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        if (result.reason === "email_taken") {
          toast.error("That email is already registered. Sign in instead.");
          return;
        }
        if (result.reason === "service_unavailable") {
          toast.error("Server is not ready for sign-up. Configure the database or use dev file auth.");
          return;
        }
        toast.error("Could not create organization.");
        return;
      }
      toast.success("Organization created. Sign in with your email and password.");
      setLocation(getLoginUrl());
    },
    onError: (e) => toast.error(e.message),
  });

  const registerWithFirebase = trpc.auth.registerOrganizationWithFirebase.useMutation({
    onSuccess: result => {
      if (!result.success) {
        if (result.reason === "email_taken") {
          toast.error("That email is already registered. Sign in instead.");
          return;
        }
        if (result.reason === "already_registered") {
          toast.error("This account already has a user. Sign in instead.");
          return;
        }
        if (result.reason === "service_unavailable") {
          toast.error("Server is not ready for sign-up. Configure the database or use dev file auth.");
          return;
        }
        toast.error("Could not create organization.");
        return;
      }
      toast.success("Organization created. You are signed in.");
      setLocation("/app");
    },
    onError: e => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!requirePhoneAndCountry()) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    register.mutate({
      organizationName: organizationName.trim(),
      phone: phone.trim(),
      country: country.trim().toUpperCase(),
      adminEmail: adminEmail.trim().toLowerCase(),
      adminDisplayName: adminDisplayName.trim(),
      password,
    });
  };

  const anyPending = register.isPending || registerWithFirebase.isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
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
          <CardTitle>Sign up</CardTitle>
          <CardDescription>
            Create an organization and become the workspace owner. When enabled, you can sign up with Google,
            Microsoft, or use a password stored by this app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showFirebase ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Create with a linked account</p>
              <p className="text-xs text-muted-foreground">
                Enter your organization name first, then choose a provider. You will be signed in after the
                workspace is created.
              </p>
              <p className="text-xs text-muted-foreground">
                Phone and country are required for the free plan. If your provider does not share an email,
                you can enter it below before continuing.
              </p>
              <FirebaseAuthOptions
                variant="signup"
                organizationName={organizationName}
                disabled={anyPending}
                pending={registerWithFirebase.isPending}
                onIdToken={idToken =>
                  requirePhoneAndCountry()
                    ? registerWithFirebase.mutate({
                        idToken,
                        organizationName: organizationName.trim(),
                        adminEmail: adminEmail.trim() ? adminEmail.trim().toLowerCase() : undefined,
                        phone: phone.trim(),
                        country: country.trim().toUpperCase(),
                        adminDisplayName: adminDisplayName.trim() || undefined,
                      })
                    : undefined
                }
              />
              <div className="relative py-1">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  or app-managed password
                </span>
              </div>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={onSubmit} autoComplete="off">
            <div className="space-y-1">
              <label className="text-sm font-medium">Organization name</label>
              <Input
                value={organizationName}
                onChange={e => setOrganizationName(e.target.value)}
                placeholder="Acme Inc."
                required
                minLength={2}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Your email (sign-in id)</label>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Country</label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a country">
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
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Your name</label>
              <Input
                value={adminDisplayName}
                onChange={e => setAdminDisplayName(e.target.value)}
                placeholder="Jane Doe"
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={anyPending}>
              {register.isPending ? "Creating…" : "Create organization"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                className="text-foreground font-semibold underline-offset-4 hover:underline"
                onClick={() => setLocation(getLoginUrl())}
              >
                Sign in
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
