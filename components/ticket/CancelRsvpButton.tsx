"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { cancelRsvp } from "@/app/actions/rsvp-cancel";

export function CancelRsvpButton(props: {
  checkInToken: string;
  eventPageHref: string;
  /** Keeps a containing event page in sync when this tab removes its RSVP. */
  onCancelled?: () => void;
}) {
  const { checkInToken, eventPageHref, onCancelled } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelRsvp({ checkInToken });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Clear the local storage ticket token
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith("yuyu:rsvp:")) {
            try {
              const val = localStorage.getItem(key);
              const parsed = val ? (JSON.parse(val) as { ticketToken?: string }) : null;
              if (parsed?.ticketToken === checkInToken) {
                localStorage.removeItem(key);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // localStorage not available
      }
      setOpen(false);
      onCancelled?.();
      router.push(eventPageHref);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center self-center text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-danger-fg"
      >
        Can&apos;t make it? Cancel registration
      </button>

      <ConfirmDialog
        open={open}
        title="Cancel your registration?"
        message="Your RSVP will be removed and your spot will be given to the next person on the waitlist (if any). This cannot be undone."
        cancelLabel="Keep registration"
        confirmLabel={pending ? "Cancelling…" : "Yes, cancel"}
        loading={pending}
        onConfirm={handleCancel}
        onCancel={() => setOpen(false)}
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </ConfirmDialog>
    </>
  );
}
