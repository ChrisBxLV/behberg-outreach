export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

<<<<<<< HEAD
export const getLoginUrl = () => "/login";

export const getSignUpUrl = () => "/signup";
=======
// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const localFallback = `${window.location.origin}/home`;

  // Local development may omit OAuth env vars. Fall back to same-origin callback
  // so UI paths can still render without throwing at runtime.
  if (!oauthPortalUrl) {
    return localFallback;
  }

  let url: URL;
  try {
    url = new URL("/app-auth", oauthPortalUrl);
  } catch {
    return localFallback;
  }

  if (appId) {
    url.searchParams.set("appId", appId);
  }
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
>>>>>>> 0d57970c52692c8257ac696d2e0c83dab0463695

/** Public marketing homepage (after sign out, back from login, etc.). */
export const getPublicHomeUrl = () => "/";
