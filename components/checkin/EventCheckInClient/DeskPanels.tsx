"use client";

import type { Dispatch, SetStateAction } from "react";
import { CloudCheck, CloudOff, Info } from "lucide-react";
import type { CheckInResultData } from "@/app/actions/checkin";
import { Button, IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Chip, ProgressBar } from "@/components/ui/display";
import { Tooltip } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { OfflineRoster } from "@/lib/offline-checkin.client";
import { InstallCheckInAppButton } from "@/components/checkin/InstallCheckInAppButton";
import type { BadgeDesignSource } from "@/components/checkin/id-card/shared";

/** The desk title with the checked-in count and, on dashboard desks, the connection state. */
export function CheckInHeader({ stationMode, eventTitle, stats, rate, isOnline }: { stationMode: boolean; eventTitle: string; stats: { confirmed: number; checkedIn: number }; rate: number; isOnline: boolean }) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {stationMode ? (
          <>
            <p className="text-sm font-semibold text-ink-muted">Venue check-in</p>
            <h1 className="break-words font-display text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{eventTitle}</h1>
          </>
        ) : (
          <h2 className="text-h4 text-ink">Check-in desk</h2>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="min-w-[132px]">
          <p className="font-display text-ink">
            <span className="text-[28px] font-semibold tabular-nums">{stats.checkedIn}</span>
            <span className="text-base font-semibold text-ink-muted"> / {stats.confirmed} confirmed</span>
          </p>
          <p className="text-caption text-ink-muted">{stats.confirmed > 0 ? `${rate}% checked in` : "No confirmed RSVPs yet"}</p>
          {stats.confirmed > 0 ? <ProgressBar value={stats.checkedIn} max={stats.confirmed} tone="success" label="Checked in" className="mt-1.5" /> : null}
        </div>
        {!stationMode ? <Chip tone={isOnline ? "success" : "warning"} icon={<span className="size-2 rounded-full bg-current" />}>{isOnline ? "Online" : "Offline"}</Chip> : null}
      </div>
    </header>
  );
}

/** Whether this device can check people in without a connection, with roster and sync controls. */
export function OfflinePanel({
  offlineRoster,
  queuedCount,
  pending,
  isOnline,
  downloadOfflineRoster,
  clearOfflineRoster,
  syncOfflineQueue,
}: {
  offlineRoster: OfflineRoster | null;
  queuedCount: number;
  pending: boolean;
  isOnline: boolean;
  downloadOfflineRoster: () => void;
  clearOfflineRoster: () => void;
  syncOfflineQueue: () => void;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between", offlineRoster ? "border-transparent bg-success-bg" : "border-line bg-subtle")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-0.5 [&_svg]:size-5", offlineRoster ? "text-success-fg" : "text-ink-muted")}>{offlineRoster ? <CloudCheck /> : <CloudOff />}</span>
        <div>
          <p className="text-label text-ink">{offlineRoster ? "Offline check-in ready" : "Offline check-in is not ready"}</p>
          <p className="text-sm text-ink-secondary">
            {offlineRoster
              ? `${offlineRoster.rows.length} attendees saved on this device${queuedCount ? ` · ${queuedCount} waiting to sync` : ""}.`
              : "Download the attendee roster while online to scan and search without a connection."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <InstallCheckInAppButton />
        <Button size="sm" variant="secondary" onClick={downloadOfflineRoster} disabled={pending || !isOnline}>
          {offlineRoster ? "Refresh roster" : "Make available offline"}
        </Button>
        {offlineRoster ? (
          <Button size="sm" variant="dangerQuiet" onClick={clearOfflineRoster} disabled={pending || queuedCount > 0}>
            Remove offline data
          </Button>
        ) : null}
        {queuedCount > 0 ? (
          <Button size="sm" variant="primary" onClick={syncOfflineQueue} disabled={pending || !isOnline}>
            Sync {queuedCount}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** The override switch and the ID card printing switch for this desk. */
export function DeskOptions({
  override,
  setOverride,
  idCardPrintingEnabled,
  setIdCardPrintingEnabled,
  setIdCardOpen,
  setIdCardAttendee,
  badgeSource,
}: {
  override: boolean;
  setOverride: (value: boolean) => void;
  idCardPrintingEnabled: boolean;
  setIdCardPrintingEnabled: (value: boolean) => void;
  setIdCardOpen: (value: boolean) => void;
  setIdCardAttendee: Dispatch<SetStateAction<CheckInResultData | null>>;
  badgeSource: BadgeDesignSource;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <Switch id="check-in-override" checked={override} onCheckedChange={setOverride} />
        <label htmlFor="check-in-override" className="text-label text-ink">Override waitlist</label>
        <Tooltip content="Allows check-in for waitlisted attendees only. Pending approval and rejected registrations remain blocked.">
          <IconButton label="About override check-in" size="sm"><Info /></IconButton>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <Switch id="check-in-id-cards" checked={idCardPrintingEnabled} onCheckedChange={(enabled) => { setIdCardPrintingEnabled(enabled); if (!enabled) setIdCardOpen(false); }} aria-describedby="check-in-id-cards-help" />
          <label htmlFor="check-in-id-cards" className="text-label text-ink">ID card printing</label>
        </div>
        {idCardPrintingEnabled && badgeSource.canSave ? <Button size="sm" variant="secondary" onClick={() => { setIdCardAttendee(null); setIdCardOpen(true); }}>Design badge</Button> : null}
      </div>
      <p id="check-in-id-cards-help" className="sr-only">Off by default. Enable it when this desk should offer cards after check-in.</p>
    </div>
  );
}
