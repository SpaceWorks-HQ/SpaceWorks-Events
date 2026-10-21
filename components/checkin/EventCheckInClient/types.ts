import type { CheckInPreviewData, CheckInResultData, LookupRow } from "@/app/actions/checkin";

export type CheckInRecentRow = {
  rsvpId: string;
  displayName: string;
  email: string | null;
  checkedInAt: string;
};
export type StationResponse =
  | { ok: true; data: CheckInPreviewData & CheckInResultData & { rows: LookupRow[] } }
  | { ok: false; error: string; needsForce?: boolean };

/** The result card's attendee: the last check-in at this desk. */
export type LastResult = (CheckInResultData & { kind?: "success" | "already" }) | null;

/** Sends one action to the PIN-authorised station endpoint. */
export type StationRequest = (action: string, payload: Record<string, unknown>) => Promise<StationResponse>;
