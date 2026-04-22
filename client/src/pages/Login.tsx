import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FirebaseAuthOptions } from "@/components/FirebaseAuthOptions";
import { Input } from "@/components/ui/input";
import { getPublicHomeUrl, getSignUpUrl } from "@/const";
import { isFirebaseClientConfigured } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type LoginMode = "signin" | "reset-request" | "reset-confirm";

export default function Login() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<LoginMode>("signin");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const { data: loginOpts } = trpc.auth.loginOptions.useQuery();

  const signInWithFirebase = trpc.auth.signInWithFirebase.useMutation({
    onSuccess: data => {
      if (!data.success) {
        if (data.reason === "service_unavailable") {
          toast.error("Server is not configured (database missing). Set DATABASE_URL and restart.");
        } else if (data.reason === "account_disabled") {
          toast.error("This account has been disabled. Contact your platform administrator.");
        } else if (data.reason === "not_registered") {
          toast.error("This account is not registered yet. Please sign up to create your workspace.");
          setLocation(getSignUpUrl());
        } else {
          toast.error("Sign in failed.");
        }
        return;
      }
      toast.success("Signed in.");
      setLocation("/app");
    },
    onError: error => {
      toast.error(error.message);
    },
  });

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

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: data => {
      if (!data.success) {
        if (data.reason === "service_unavailable") {
          toast.error("Server is not ready. Set DATABASE_URL or use dev auth.");
        } else if (data.reason === "rate_limited") {
          const s = "retryAfterSeconds" in data ? data.retryAfterSeconds ?? 60 : 60;
          toast.error(`Please wait ${s}s before requesting another code.`);
        } else if (data.reason === "delivery_not_configured") {
          toast.error(
            "For non-email sign-in ids, set OTP_DELIVERY_EMAIL (or SMTP_USER) so the reset code can be delivered.",
          );
        } else if (data.reason === "mail_send_failed") {
          toast.error("Could not send email. Check SMTP settings.");
        } else {
          toast.error("Could not send reset code.");
        }
        return;
      }
      if (data.emailed) {
        toast.success("Check your email for a 6-digit reset code.");
        setMode("reset-confirm");
        setResetCode("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        toast.info(
          showFirebase
            ? "No reset email was sent. That sign-in id may not use a saved workspace password (try social sign-in above), or the account does not exist."
            : "No reset email was sent. That sign-in id may not use a saved workspace password, or the account does not exist.",
        );
      }
    },
    onError: e => toast.error(e.message),
  });

  const completeReset = trpc.auth.completePasswordReset.useMutation({
    onSuccess: data => {
      if (!data.success) {
        if (data.reason === "expired") toast.error("Code expired. Request a new one.");
        else if (data.reason === "too_many_attempts") toast.error("Too many attempts. Request a new code.");
        else toast.error("Invalid code or unable to reset.");
        return;
      }
      toast.success("Password updated. Sign in with your new password.");
      setMode("signin");
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
    },
    onError: e => toast.error(e.message),
  });

  const onRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    const id = loginId.trim().toLowerCase();
    if (!id) {
      toast.error("Enter your username or email.");
      return;
    }
    requestReset.mutate({ loginId: id });
  };

  const onCompleteReset = (e: React.FormEvent) => {
    e.preventDefault();
    const id = loginId.trim().toLowerCase();
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    completeReset.mutate({ loginId: id, code: resetCode.trim(), newPassword });
  };

  const requireOtp = loginOpts?.requireEmailOtp ?? false;
  const showFirebase = Boolean(loginOpts?.firebaseSignInEnabled) && isFirebaseClientConfigured();
  const busy =
    requestCode.isPending ||
    signInWithFirebase.isPending ||
    requestReset.isPending ||
    completeReset.isPending;

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
          <CardTitle>
            {mode === "signin" ? "Sign in" : mode === "reset-request" ? "Reset password" : "Choose new password"}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? showFirebase
                ? "Use Google or Microsoft, or your workspace username and password."
                : requireOtp
                  ? "Enter your username and password. We will email you a 6-digit verification code."
                  : "Enter your username and password to open the admin console."
              : mode === "reset-request"
                ? "Enter the same username or email you use to sign in. We will email a 6-digit code if this account has a saved password."
                : "Enter the code from your email and a new password (at least 8 characters)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "signin" && showFirebase ? (
            <>
              <FirebaseAuthOptions
                variant="login"
                disabled={busy}
                pending={signInWithFirebase.isPending}
                onIdToken={idToken => signInWithFirebase.mutate({ idToken })}
              />
              <div className="relative py-1">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  or workspace password
                </span>
              </div>
            </>
          ) : null}

          {mode === "signin" ? (
            <form className="space-y-4" onSubmit={onSubmit} autoComplete="off">
              <Input
                type="text"
                name="login-id"
                autoComplete="username"
                placeholder="Username or email"
                value={loginId}
                onChange={event => setLoginId(event.target.value)}
                required
                autoFocus={!showFirebase}
              />
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {requestCode.isPending
                  ? requireOtp
                    ? "Sending code..."
                    : "Signing in..."
                  : requireOtp
                    ? "Continue"
                    : "Sign in"}
              </Button>
              <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground pt-1">
                <button
                  type="button"
                  className="text-foreground font-medium underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode("reset-request");
                    setPassword("");
                  }}
                >
                  Forgot password?
                </button>
                <p>
                  New organization?{" "}
                  <button
                    type="button"
                    className="text-foreground font-semibold underline-offset-4 hover:underline"
                    onClick={() => setLocation(getSignUpUrl())}
                  >
                    Sign up
                  </button>
                </p>
              </div>
            </form>
          ) : null}

          {mode === "reset-request" ? (
            <form className="space-y-4" onSubmit={onRequestReset} autoComplete="off">
              <Input
                type="text"
                name="reset-login-id"
                autoComplete="username"
                placeholder="Username or email"
                value={loginId}
                onChange={event => setLoginId(event.target.value)}
                required
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {requestReset.isPending ? "Sending…" : "Send reset code"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {mode === "reset-confirm" ? (
            <form className="space-y-4" onSubmit={onCompleteReset} autoComplete="off">
              <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                Resetting password for <span className="font-medium text-foreground">{loginId}</span>
              </p>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6-digit code"
                value={resetCode}
                onChange={e => setResetCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
              />
              <Input
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder="New password (min 8 characters)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <Input
                type="password"
                name="confirm-new-password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {completeReset.isPending ? "Saving…" : "Update password"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setMode("reset-request")}
              >
                Resend code
              </button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
