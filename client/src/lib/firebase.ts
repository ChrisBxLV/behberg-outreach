import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type Auth,
  type AuthProvider,
} from "firebase/auth";

function readFirebaseWebConfig(): FirebaseOptions | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const opts: FirebaseOptions = {
    apiKey,
    authDomain,
    projectId,
    appId,
  };
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim();
  if (storageBucket) opts.storageBucket = storageBucket;
  if (messagingSenderId) opts.messagingSenderId = messagingSenderId;
  if (measurementId) opts.measurementId = measurementId;
  return opts;
}

export function isFirebaseClientConfigured(): boolean {
  return readFirebaseWebConfig() !== null;
}

function getFirebaseAuth(): Auth | null {
  const config = readFirebaseWebConfig();
  if (!config) return null;
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return getAuth(app);
}

/**
 * How long we wait for the Firebase popup flow to resolve before we surface a
 * timeout error. The popup itself is not cancellable (Firebase exposes no API
 * for that), so this only bounds the *spinner* we show to the user; if the
 * popup eventually resolves the user will simply have to click again.
 */
const POPUP_TIMEOUT_MS = 45_000;

function getAuthDomainHint(): string {
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  return authDomain
    ? `VITE_FIREBASE_AUTH_DOMAIN is "${authDomain}" — it must be listed under Firebase Console → Authentication → Settings → Authorized domains.`
    : "VITE_FIREBASE_AUTH_DOMAIN is not set in the client build; the popup will never complete until it points at a Firebase Console → Authentication → Authorized domain.";
}

function buildPopupTimeoutError(): Error {
  const err = new Error(
    `Firebase popup did not complete. Check authorized domains and authDomain. ${getAuthDomainHint()}`,
  );
  (err as Error & { code?: string }).code = "popup-timeout";
  return err;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(buildPopupTimeoutError()), ms);
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function idTokenFromPopup(
  providerLabel: string,
  createProvider: () => AuthProvider,
): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  console.info(`[FirebaseAuth] popup started (${providerLabel})`);
  const cred = await withTimeout(signInWithPopup(auth, createProvider()), POPUP_TIMEOUT_MS);
  console.info(`[FirebaseAuth] popup returned (${providerLabel})`);
  console.info(`[FirebaseAuth] ID token requested (${providerLabel})`);
  const token = await cred.user.getIdToken();
  // Never log the token value itself; only the fact that we got one.
  console.info(`[FirebaseAuth] ID token received (${providerLabel})`);
  return token;
}

export async function signInWithGoogleIdToken(): Promise<string | null> {
  return idTokenFromPopup("google", () => new GoogleAuthProvider());
}

export async function signInWithMicrosoftIdToken(): Promise<string | null> {
  return idTokenFromPopup("microsoft", () => {
    const p = new OAuthProvider("microsoft.com");
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  });
}
