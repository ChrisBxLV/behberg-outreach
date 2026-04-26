import * as React from "react";
import {
  makeAllowAllConsent,
  makeRejectAllConsent,
  readCookieConsent,
  type CookieConsent,
  writeCookieConsent,
} from "@/lib/cookieConsent";

type CookieConsentContextValue = {
  consent: CookieConsent | null;
  hasSavedConsent: boolean;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  save: (partial: Pick<CookieConsent, "performance" | "functional" | "targeting">) => void;
  allowAll: () => void;
  rejectAll: () => void;
};

const CookieConsentContext = React.createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = React.useState<CookieConsent | null>(() => readCookieConsent());
  const [hasSavedConsent, setHasSavedConsent] = React.useState(() => Boolean(readCookieConsent()));
  const [isModalOpen, setIsModalOpen] = React.useState(() => !Boolean(readCookieConsent()));

  const openModal = React.useCallback(() => setIsModalOpen(true), []);
  const closeModal = React.useCallback(() => setIsModalOpen(false), []);

  const save = React.useCallback(
    (partial: Pick<CookieConsent, "performance" | "functional" | "targeting">) => {
      const next = writeCookieConsent(partial);
      setConsent(next);
      setHasSavedConsent(true);
      setIsModalOpen(false);
    },
    [],
  );

  const allowAll = React.useCallback(() => {
    const next = makeAllowAllConsent();
    setConsent(next);
    setHasSavedConsent(true);
    setIsModalOpen(false);
  }, []);

  const rejectAll = React.useCallback(() => {
    const next = makeRejectAllConsent();
    setConsent(next);
    setHasSavedConsent(true);
    setIsModalOpen(false);
  }, []);

  const value = React.useMemo<CookieConsentContextValue>(
    () => ({
      consent,
      hasSavedConsent,
      isModalOpen,
      openModal,
      closeModal,
      save,
      allowAll,
      rejectAll,
    }),
    [allowAll, closeModal, consent, hasSavedConsent, isModalOpen, openModal, rejectAll, save],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent() {
  const ctx = React.useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider");
  }
  return ctx;
}

