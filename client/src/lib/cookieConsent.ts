export type CookieConsent = {
  strictlyNecessary: true;
  performance: boolean;
  functional: boolean;
  targeting: boolean;
  updatedAt: string; // ISO
  version: 1;
};

const STORAGE_KEY = "krot_cookie_consent_v1";

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent> | null;
    if (!parsed || parsed.version !== 1) return null;
    if (parsed.strictlyNecessary !== true) return null;
    if (typeof parsed.performance !== "boolean") return null;
    if (typeof parsed.functional !== "boolean") return null;
    if (typeof parsed.targeting !== "boolean") return null;
    if (typeof parsed.updatedAt !== "string") return null;
    return parsed as CookieConsent;
  } catch {
    return null;
  }
}

export function writeCookieConsent(
  partial: Pick<CookieConsent, "performance" | "functional" | "targeting">,
): CookieConsent {
  const consent: CookieConsent = {
    version: 1,
    strictlyNecessary: true,
    ...partial,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  }

  return consent;
}

export function makeAllowAllConsent(): CookieConsent {
  return writeCookieConsent({
    performance: true,
    functional: true,
    targeting: true,
  });
}

export function makeRejectAllConsent(): CookieConsent {
  return writeCookieConsent({
    performance: false,
    functional: false,
    targeting: false,
  });
}

