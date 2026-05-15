import { getPublicHomeUrl } from "@/const";
import VisualProductLanding from "./VisualProductLanding";

/**
 * Public marketing homepage.
 */
export default function InsideSoftwareLanding() {
  return (
    <VisualProductLanding brandHomeHref={getPublicHomeUrl()} />
  );
}
