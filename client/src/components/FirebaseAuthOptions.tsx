import { Button } from "@/components/ui/button";
import {
  signInWithGoogleIdToken,
  signInWithMicrosoftIdToken,
  isFirebaseClientConfigured,
} from "@/lib/firebase";
import { isFirebasePopupCancelled } from "@/lib/firebaseAuthErrors";
import { toast } from "sonner";

export type FirebaseAuthOptionsProps = {
  variant: "login" | "signup";
  /** Required for signup: organization name before OAuth. */
  organizationName?: string;
  disabled?: boolean;
  pending?: boolean;
  onIdToken: (idToken: string) => void;
};

function describeFirebaseError(err: unknown): { code?: string; message?: string } {
  if (typeof err !== "object" || err === null) return {};
  const anyErr = err as { code?: unknown; message?: unknown };
  const code = typeof anyErr.code === "string" ? anyErr.code : undefined;
  const message = typeof anyErr.message === "string" ? anyErr.message : undefined;
  return { code, message };
}

const AUTH_DOMAIN_HINT =
  "If this persists, verify VITE_FIREBASE_AUTH_DOMAIN points at a host listed under Firebase Console → Authentication → Settings → Authorized domains.";

async function runProvider(
  label: string,
  getToken: () => Promise<string | null>,
  onIdToken: (idToken: string) => void,
) {
  if (!isFirebaseClientConfigured()) {
    toast.error("Firebase is not configured in this build (missing VITE_FIREBASE_*).");
    return;
  }
  try {
    const token = await getToken();
    if (!token) {
      toast.error(
        `${label} did not complete (no token). Try again, use another provider, or sign in with your workspace username and password. ${AUTH_DOMAIN_HINT}`,
        { duration: 12000 },
      );
      return;
    }
    onIdToken(token);
  } catch (err: unknown) {
    if (isFirebasePopupCancelled(err)) return;
    const { code, message } = describeFirebaseError(err);
    console.error(`[FirebaseAuth] ${label} failed`, { code, message, err });
    const codeStr = code ?? "unknown";
    const messageStr = message ?? "Unknown error.";
    // The synthetic popup-timeout error already embeds the authorized-domains
    // guidance in its message; appending AUTH_DOMAIN_HINT again would duplicate
    // it. For real Firebase error codes the hint is still useful.
    const trailingHint = code === "popup-timeout" ? "" : ` ${AUTH_DOMAIN_HINT}`;
    toast.error(`${label} failed (${codeStr}): ${messageStr}${trailingHint}`, {
      duration: 12000,
    });
  }
}

export function FirebaseAuthOptions({
  variant,
  organizationName = "",
  disabled = false,
  pending = false,
  onIdToken,
}: FirebaseAuthOptionsProps) {
  const busy = Boolean(disabled || pending);

  const guardSignupOrgName = (): boolean => {
    if (variant !== "signup") return true;
    if (organizationName.trim().length >= 2) return true;
    toast.error("Enter an organization name (at least 2 characters) before using social sign-up.");
    return false;
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Continue with</p>
      <div className="grid gap-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => {
            console.info("[FirebaseAuth] provider clicked (google)");
            if (!guardSignupOrgName()) return;
            void runProvider("Google sign-in", signInWithGoogleIdToken, onIdToken);
          }}
        >
          Google
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => {
            console.info("[FirebaseAuth] provider clicked (microsoft)");
            if (!guardSignupOrgName()) return;
            void runProvider("Microsoft sign-in", signInWithMicrosoftIdToken, onIdToken);
          }}
        >
          Microsoft
        </Button>
      </div>
    </div>
  );
}
