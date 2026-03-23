import VersionSevenLandingReplica from "./VersionSevenLandingReplica";

/**
 * Public marketing homepage. Admin console is reached only via "Sign in" -> /login -> /app.
 */
export default function InsideSoftwareLanding() {
  return (
    <VersionSevenLandingReplica primaryCtaHref="/home" signInHref="/login" signUpHref="/signup" />
  );
}
