import { getPublicMarketingAltUrl } from "@/const";
import VisualProductLanding from "./VisualProductLanding";

export default function MarketingLanding() {
  return (
    <VisualProductLanding brandHomeHref={getPublicMarketingAltUrl()} />
  );
}
