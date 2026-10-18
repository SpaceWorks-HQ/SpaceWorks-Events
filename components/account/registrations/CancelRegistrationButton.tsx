"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { cancelRsvp } from "@/app/actions/rsvp-cancel";

/** Drop a cached RSVP marker for this ticket so event pages stop showing "registered". */
function forgetStoredTicket(token: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("yuyu:rsvp:")) continue;
      try {
        const value = localStorage.getItem(key);
        const parsed = value ? (JSON.parse(value) as { ticketToken?: string }) : null;
        if (parsed?.ticketToken === token) localStorage.removeItem(key);
      } catch {
        // Ignore unreadable entries.
      }
    }
  } catch {
    // Storage unavailable (private mode, blocked site data).
  }
}

/**
 * Withdraw from one registration through the existing `cancelRsvp` action,
 * which re-checks ownership, check-in state and waitlist promotion server-side.
 */
export function CancelRegistrationButton({ cancelToken, eventTitle }: { cancelToken: string; eventTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelRsvp({ checkInToken: cancelToken });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      forgetStoredTicket(cancelToken);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="dangerQuiet" size="sm" onClick={() => setOpen(true)} aria-label={`Cancel registration for ${eventTitle}`}>
        Cancel registration
      </Button>
      <ConfirmDialog
        open={open}
        title="Cancel your registration?"
        message={`Your place at ${eventTitle} will be released and offered to the next person on the waitlist, if there is one. This can't be undone.`}
        cancelLabel="Keep registration"
        confirmLabel={pending ? "Cancelling…" : "Cancel registration"}
        loading={pending}
        onConfirm={handleConfirm}
        onCancel={() => {
          setError(null);
          setOpen(false);
        }}
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </ConfirmDialog>
    </>
  );
}
