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

async function idTokenFromPopup(createProvider: () => AuthProvider): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const cred = await signInWithPopup(auth, createProvider());
  return await cred.user.getIdToken();
}

export async function signInWithGoogleIdToken(): Promise<string | null> {
  return idTokenFromPopup(() => new GoogleAuthProvider());
}

export async function signInWithMicrosoftIdToken(): Promise<string | null> {
  return idTokenFromPopup(() => {
    const p = new OAuthProvider("microsoft.com");
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  });
}
