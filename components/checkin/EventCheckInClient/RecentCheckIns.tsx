"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CheckInTimestamp } from "./parts";
import type { CheckInRecentRow } from "./types";

/** The latest check-ins with undo, as a list on phones and a table on wider screens. */
export function RecentCheckIns({
  stationMode,
  downloadCsv,
  recent,
  onUndo,
  pending,
  isOnline,
}: {
  stationMode: boolean;
  downloadCsv: () => void;
  recent: CheckInRecentRow[];
  onUndo: (rsvpId: string) => void;
  pending: boolean;
  isOnline: boolean;
}) {
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="recent-title" className="text-h4 text-ink">Recent check-ins</h2>
          {!stationMode ? <p className="text-caption text-ink-muted">Export includes the list on this page (up to 200). This page refreshes automatically while it is open.</p> : null}
        </div>
        <Button size="sm" variant="secondary" onClick={downloadCsv} disabled={recent.length === 0}>
          Export CSV (shown below)
        </Button>
      </div>
      {recent.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No check-ins yet.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-canvas px-4 sm:hidden">
            {recent.map((r) => (
              <li key={r.rsvpId} className="flex items-center gap-3 py-3">
                <Check aria-hidden className="size-4 shrink-0 text-success-fg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{r.displayName}</p>
                  {r.email ? <p className="truncate text-sm text-ink-muted">{r.email}</p> : null}
                  <p className="text-caption text-ink-muted"><CheckInTimestamp value={r.checkedInAt} /></p>
                </div>
                <Button size="sm" variant="quiet" onClick={() => onUndo(r.rsvpId)} disabled={pending || !isOnline}>Undo check-in</Button>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Table label="Recent check-ins">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Checked in</TH>
                  <TH className="text-right">Undo</TH>
                </tr>
              </THead>
              <TBody>
                {recent.map((r) => (
                  <TR key={r.rsvpId}>
                    <TD className="font-semibold">{r.displayName}</TD>
                    <TD className="text-ink-secondary">{r.email ?? "—"}</TD>
                    <TD className="text-ink-secondary"><CheckInTimestamp value={r.checkedInAt} /></TD>
                    <TD className="text-right">
                      <Button size="sm" variant="quiet" onClick={() => onUndo(r.rsvpId)} disabled={pending || !isOnline}>Undo</Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
