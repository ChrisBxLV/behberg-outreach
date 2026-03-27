import { getPublicHomeUrl } from "@/const";
import VersionSevenLandingReplica from "./VersionSevenLandingReplica";

/**
 * Public marketing homepage.
 */
export default function InsideSoftwareLanding() {
  return (
    <VersionSevenLandingReplica brandHomeHref={getPublicHomeUrl()} />
  );
}
