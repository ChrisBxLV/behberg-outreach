import { useEffect, useState } from "react";
import { Link } from "wouter";

export default function Unsubscribe() {
  const [status, setStatus] = useState("");
  useEffect(() => {
    setStatus(new URLSearchParams(window.location.search).get("status") ?? "");
  }, []);

  const title =
    status === "ok"
      ? "You're unsubscribed"
      : status === "invalid"
        ? "Link not valid"
        : status === "error"
          ? "Something went wrong"
          : "Email preferences";

  const body =
    status === "ok"
      ? "You will not receive further outreach from that sender’s mailbox. Other organizations may still contact you at this address."
      : status === "invalid"
        ? "This unsubscribe link is invalid or has expired."
        : status === "error"
          ? "We could not complete the request. Try again from the email or contact support."
          : "Use the link from your email to manage subscription preferences.";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-border/50 bg-card/80 p-8 shadow-lg">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{body}</p>
        <p className="mt-6">
          <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
