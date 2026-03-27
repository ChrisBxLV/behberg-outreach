export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const getLoginUrl = () => "/login";
export const getSignUpUrl = () => "/signup";

/** Authenticated app shell home (dashboard). */
export const getAppHomeUrl = () => "/app";

/** Public marketing homepage (after sign out, back from login, etc.). */
export const getPublicHomeUrl = () => "/";

/**
 * Alternate public marketing route (`MarketingLanding`).
 * Some flows (e.g. 404 "Go Home" for guests) use this instead of `/`.
 */
export const getPublicMarketingAltUrl = () => "/home";
