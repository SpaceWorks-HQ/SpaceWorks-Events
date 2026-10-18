"use client";

import { useEffect } from "react";
import type { RsvpStatus } from "@prisma/client";

/**
 * A ticket URL is a bearer capability. Only update an RSVP record already
 * saved in this browser, and only when it belongs to the ticket being viewed.
 */
export function TicketStatusStorageSync(props: {
  checkInToken: string;
  status: RsvpStatus;
}) {
  const { checkInToken, status } = props;

  useEffect(() => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (!key.startsWith("swe:rsvp:")) continue;
        const raw = window.localStorage.getItem(key);
        const saved = raw ? (JSON.parse(raw) as { ticketToken?: string; status?: RsvpStatus }) : null;
        if (saved?.ticketToken !== checkInToken || saved.status === status) continue;
        window.localStorage.setItem(key, JSON.stringify({ ...saved, status }));
      }
    } catch {
      // Local storage can be disabled; the server-rendered ticket remains correct.
    }
  }, [checkInToken, status]);

  return null;
}
