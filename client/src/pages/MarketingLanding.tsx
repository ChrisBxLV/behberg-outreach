import VersionSevenLandingReplica from "./VersionSevenLandingReplica";
<<<<<<< HEAD

export default function MarketingLanding() {
  return <VersionSevenLandingReplica primaryCtaHref="/" signInHref="/login" signUpHref="/signup" />;
=======
import { getLoginUrl } from "@/const";

export default function MarketingLanding() {
  return <VersionSevenLandingReplica primaryCtaHref={getLoginUrl()} />;
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695
}

