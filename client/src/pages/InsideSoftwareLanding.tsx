<<<<<<< HEAD
import VersionSevenLandingReplica from "./VersionSevenLandingReplica";

/**
 * Public marketing homepage. Admin console is reached only via "Sign in" -> /login -> /app.
 */
export default function InsideSoftwareLanding() {
  return (
    <VersionSevenLandingReplica primaryCtaHref="/home" signInHref="/login" signUpHref="/signup" />
  );
}
=======
import { useAuth } from "@/_core/hooks/useAuth";
import VersionSevenLandingReplica from "./VersionSevenLandingReplica";
import { getLoginUrl } from "@/const";

export default function InsideSoftwareLanding() {
  const { loading, user } = useAuth({ redirectOnUnauthenticated: true });

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm font-semibold text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  // Inside-software landing: primary CTAs should take the user into the app.
  return <VersionSevenLandingReplica primaryCtaHref="/app" />;
}

>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
