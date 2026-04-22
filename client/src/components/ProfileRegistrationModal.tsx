import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProfileCompletionForm } from "@/components/ProfileCompletionForm";
import {
  PROFILE_REGISTRATION_GRACE_MS,
  readProfileRegistrationDismissedAt,
  writeProfileRegistrationDismissedAt,
} from "@/lib/profileRegistrationModal";
import { useEffect, useState } from "react";

type MeUser = {
  phone?: string | null;
  country?: string | null;
  isPlatformOperator?: boolean;
  role?: string;
};

export function ProfileRegistrationModal({ user }: { user: MeUser }) {
  const exempt = Boolean(user.isPlatformOperator || user.role === "superadmin");
  const incomplete = !user.phone?.trim() || !user.country?.trim();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!incomplete || exempt) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [incomplete, exempt]);

  void tick;
  const now = Date.now();
  const dismissedAt = readProfileRegistrationDismissedAt();
  const inGrace = Number.isFinite(dismissedAt) && now - dismissedAt < PROFILE_REGISTRATION_GRACE_MS;
  const blocking =
    Number.isFinite(dismissedAt) && now - dismissedAt >= PROFILE_REGISTRATION_GRACE_MS;
  const open = incomplete && !exempt && !inGrace;

  const onOpenChange = (next: boolean) => {
    if (!next && blocking) return;
    if (!next) {
      writeProfileRegistrationDismissedAt(Date.now());
      setTick(t => t + 1);
    }
  };

  if (!incomplete || exempt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!blocking}
        onPointerDownOutside={e => blocking && e.preventDefault()}
        onInteractOutside={e => blocking && e.preventDefault()}
        onEscapeKeyDown={e => blocking && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Finish registration</DialogTitle>
          <DialogDescription>
            Add your phone number and country to continue using the app.
          </DialogDescription>
        </DialogHeader>
        <ProfileCompletionForm />
      </DialogContent>
    </Dialog>
  );
}
