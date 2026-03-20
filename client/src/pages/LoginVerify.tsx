import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPublicHomeUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function LoginVerify() {
  const [location, setLocation] = useLocation();
  const [code, setCode] = useState("");

  const loginId = useMemo(() => {
    const query = location.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    return (params.get("loginId") ?? params.get("email") ?? "").trim().toLowerCase();
  }, [location]);

  const verifyCode = trpc.auth.verifyLoginCode.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Signed in successfully.");
        setLocation("/app");
        return;
      }
      if (result.reason === "expired") {
        toast.error("Code expired. Request a new code.");
      } else if (result.reason === "too_many_attempts") {
        toast.error("Too many failed attempts. Request a new code.");
      } else if (result.reason === "service_unavailable") {
        toast.error("Server is not configured (database missing). Set DATABASE_URL and restart.");
      } else {
        toast.error("Invalid verification code.");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginId) {
      toast.error("Missing login. Please start again.");
      setLocation("/login");
      return;
    }
    verifyCode.mutate({ loginId, code });
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
          <CardTitle>Verify sign in</CardTitle>
          <CardDescription>
            Enter the 6-digit code sent to your email
            {loginId.includes("@") ? ` (${loginId})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={verifyCode.isPending}>
              {verifyCode.isPending ? "Verifying..." : "Sign in"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setLocation("/login")}>
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
