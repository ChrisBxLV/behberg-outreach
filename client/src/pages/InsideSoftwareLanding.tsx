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

