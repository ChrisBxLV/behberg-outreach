import admin from "firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";

function ensureFirebaseAdminInitialized(): void {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(parsed) });
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    admin.initializeApp();
    return;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (projectId) {
    admin.initializeApp({ projectId });
    return;
  }

  throw new Error("Firebase Admin is not configured.");
}

/** True when the server can verify Firebase ID tokens (Admin SDK or project id + ADC). */
export function isFirebaseServerAuthConfigured(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  return Boolean(projectId);
}

/**
 * OAuth and other non-password providers. Firebase Email/Password (`password`) is disabled for this app.
 */
export function isFirebaseSignInProviderAllowed(signInProvider: string | undefined): boolean {
  if (!signInProvider) return false;
  if (signInProvider === "password") return false;
  if (signInProvider === "anonymous") return false;
  return true;
}

export function firebaseProviderRequiresVerifiedEmail(signInProvider: string | undefined): boolean {
  if (!signInProvider) return false;
  return signInProvider !== "phone";
}

export function firebaseLoginMethodFromDecoded(decoded: DecodedIdToken): string {
  const p = decoded.firebase?.sign_in_provider;
  if (!p) return "firebase";
  const safe = p.replace(/\./g, "_");
  return `firebase_${safe}`;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  ensureFirebaseAdminInitialized();
  return admin.auth().verifyIdToken(idToken);
}
