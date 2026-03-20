import VersionSevenLandingReplica from "./VersionSevenLandingReplica";
import { getLoginUrl } from "@/const";

export default function MarketingLanding() {
  return <VersionSevenLandingReplica primaryCtaHref={getLoginUrl()} />;
}

