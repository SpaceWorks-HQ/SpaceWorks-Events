"use client";

import { useEffect, useState } from "react";
import { watchTicketCheckIn, type TicketCheckInStatus } from "@/components/ticket/ticketCheckInWatcher";

export type TicketCheckInState = TicketCheckInStatus & {
  /** True only when the check-in happened while this page was open. */
  justCheckedIn: boolean;
};

/**
 * Live check-in state for a ticket. A ticket that loaded already checked in
 * (or a hook called with `enabled: false`) is not watched at all; otherwise the hook listens until the check-in arrives
 * and then stops every connection. See `ticketCheckInWatcher.ts`.
 */
export function useTicketCheckIn(
  token: string,
  initial: TicketCheckInStatus,
  options: { enabled?: boolean } = {},
): TicketCheckInState {
  const [state, setState] = useState<TicketCheckInState>(() => ({
    checkedIn: initial.checkedIn,
    checkedInAt: initial.checkedInAt,
    justCheckedIn: false,
  }));
  const watch = options.enabled !== false && !initial.checkedIn && !state.checkedIn;

  useEffect(() => {
    if (!watch) return;
    return watchTicketCheckIn(token, (checkedInAt) => {
      setState({ checkedIn: true, checkedInAt, justCheckedIn: true });
    });
  }, [token, watch]);

  return state;
}
