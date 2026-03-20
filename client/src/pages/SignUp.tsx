import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginUrl, getPublicHomeUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function SignUp() {
  const [, setLocation] = useLocation();
  const [organizationName, setOrganizationName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    register.mutate({
      organizationName: organizationName.trim(),
      adminEmail: adminEmail.trim().toLowerCase(),
      adminDisplayName: adminDisplayName.trim(),
      password,
    });
  };

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
            Create an organization and become the workspace owner. You can add team members after you sign
            in.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <Button type="submit" className="w-full" disabled={register.isPending}>
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
