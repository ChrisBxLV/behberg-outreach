import { Button } from "@/components/ui/button";
import {
  signInWithAppleIdToken,
  signInWithGithubIdToken,
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
        `${label} did not complete (no token). Try again, use another provider, or sign in with your workspace username and password.`,
      );
      return;
    }
    onIdToken(token);
  } catch (err: unknown) {
    if (isFirebasePopupCancelled(err)) return;
    toast.error(`${label} failed. Try again or check Firebase Console (provider enabled).`);
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
            if (!guardSignupOrgName()) return;
            void runProvider("Microsoft sign-in", signInWithMicrosoftIdToken, onIdToken);
          }}
        >
          Microsoft
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => {
            if (!guardSignupOrgName()) return;
            void runProvider("GitHub sign-in", signInWithGithubIdToken, onIdToken);
          }}
        >
          GitHub
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => {
            if (!guardSignupOrgName()) return;
            void runProvider("Apple sign-in", signInWithAppleIdToken, onIdToken);
          }}
        >
          Apple
        </Button>
      </div>
    </div>
  );
}
