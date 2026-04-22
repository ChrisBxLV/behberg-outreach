/** localStorage: timestamp (ms) when user dismissed the profile completion modal (grace before blocking). */
export const PROFILE_REGISTRATION_DISMISSED_AT_KEY = "behberg_profile_reminder_dismissed_at";

export const PROFILE_REGISTRATION_GRACE_MS = 5 * 60 * 1000;

export function clearProfileRegistrationDismissState(): void {
  try {
    localStorage.removeItem(PROFILE_REGISTRATION_DISMISSED_AT_KEY);
  } catch {
    /* ignore */
  }
}

export function readProfileRegistrationDismissedAt(): number {
  try {
    const raw = localStorage.getItem(PROFILE_REGISTRATION_DISMISSED_AT_KEY);
    if (raw == null || raw === "") return NaN;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : NaN;
  } catch {
    return NaN;
  }
}

export function writeProfileRegistrationDismissedAt(ts: number): void {
  try {
    localStorage.setItem(PROFILE_REGISTRATION_DISMISSED_AT_KEY, String(ts));
  } catch {
    /* ignore */
  }
}
