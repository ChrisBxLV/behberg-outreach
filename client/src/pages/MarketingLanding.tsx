import { getPublicMarketingAltUrl } from "@/const";
import VersionSevenLandingReplica from "./VersionSevenLandingReplica";

export default function MarketingLanding() {
  return (
    <VersionSevenLandingReplica brandHomeHref={getPublicMarketingAltUrl()} />
  );
}
