import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPublicHomeUrl, getSignUpUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  const { data: loginOpts } = trpc.auth.loginOptions.useQuery();

  const requestCode = trpc.auth.requestLoginCode.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        const reason = (result as { reason?: string; retryAfterSeconds?: number })?.reason;
        if (reason === "invalid_credentials") {
          toast.error("Invalid username or password.");
          return;
        }
        if (reason === "service_unavailable") {
          toast.error("Server is not configured (database missing). Set DATABASE_URL and restart.");
          return;
        }
        if (reason === "rate_limited") {
          const s = (result as { retryAfterSeconds?: number }).retryAfterSeconds ?? 60;
          toast.error(`Please wait ${s}s before requesting another code.`);
          return;
        }
        if (reason === "otp_mail_not_configured") {
          toast.error(
            "Email verification is on but no delivery address is set. Add OTP_DELIVERY_EMAIL or SMTP_USER, or use an email-shaped login.",
          );
          return;
        }
        toast.error("Sign in failed.");
        return;
      }

      if ("requireOtp" in result && result.requireOtp === false) {
        toast.success("Signed in.");
        setLocation("/app");
        return;
      }

      toast.success("Verification code sent. Check your email.");
      setLocation(`/login/verify?loginId=${encodeURIComponent(loginId.trim().toLowerCase())}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestCode.mutate({ loginId: loginId.trim().toLowerCase(), password });
  };

  const requireOtp = loginOpts?.requireEmailOtp ?? false;

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
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {requireOtp
              ? "Enter your username and password. We will email you a 6-digit verification code."
              : "Enter your username and password to open the admin console."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit} autoComplete="off">
            <Input
              type="text"
              name="login-id"
              autoComplete="username"
              placeholder="Username or email"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              required
              autoFocus
            />
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={requestCode.isPending}>
              {requestCode.isPending
                ? requireOtp
                  ? "Sending code..."
                  : "Signing in..."
                : requireOtp
                  ? "Continue"
                  : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground pt-1">
              New organization?{" "}
              <button
                type="button"
                className="text-foreground font-semibold underline-offset-4 hover:underline"
                onClick={() => setLocation(getSignUpUrl())}
              >
                Sign up
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
