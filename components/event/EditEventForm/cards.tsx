"use client";

import { useId, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { EventClientDto } from "@/lib/eventDto";
import { SwitchRow } from "@/components/ui/choice";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { zonedDatetimeLocalValue } from "@/lib/timeZone";

const timezones = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** The event's wall-clock time ("YYYY-MM-DDTHH:mm") in its own timezone, for a native datetime-local input. */
export function zonedInputValue(value: Date | string, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : zonedDatetimeLocalValue(date, timeZone);
}

/** One titled card of the details form. */
export function FormCard({ title, description, children }: { title: ReactNode; description: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-5 sm:p-6">
      <div>
        <h2 id={titleId} className="flex flex-wrap items-center gap-2 text-h4 text-ink">{title}</h2>
        <p className="mt-0.5 text-body-ui text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ScheduleCard({
  start,
  setStart,
  end,
  setEnd,
  timezone,
  setTimezone,
}: {
  start: string;
  setStart: Dispatch<SetStateAction<string>>;
  end: string;
  setEnd: Dispatch<SetStateAction<string>>;
  timezone: string;
  setTimezone: Dispatch<SetStateAction<string>>;
}) {
  return (
  <FormCard title="Schedule" description="Set the date, time, and timezone for guests.">
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Start" required>
        <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="End" required>
        <Input type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Field label="Timezone" required>
        <Dropdown name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </Dropdown>
      </Field>
    </div>
  </FormCard>
  );
}

export function LocationCard({
  event,
  isOnlinePreview,
  setIsOnlinePreview,
  mapLinkPreviewUrl,
  setMapLinkPreviewUrl,
  setDirty,
}: {
  event: EventClientDto;
  isOnlinePreview: boolean;
  setIsOnlinePreview: Dispatch<SetStateAction<boolean>>;
  mapLinkPreviewUrl: string;
  setMapLinkPreviewUrl: Dispatch<SetStateAction<string>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
}) {
  return (
  <FormCard title="Location" description="Choose whether this is online and what guests should see.">
    <SwitchRow
      name="isOnline"
      label="Online event"
      description="Guests will see “Online event”."
      checked={isOnlinePreview}
      onCheckedChange={(checked) => {
        setIsOnlinePreview(checked);
        setDirty(true);
      }}
      className="rounded-xl border border-line p-3.5"
    />
    <Field
      label={isOnlinePreview ? "Online meeting link" : "Location"}
      required
      helperText={isOnlinePreview ? "Enter a valid HTTP(S) meeting URL." : "Eg: Samagatha Foundation, Bengaluru"}
    >
      <Input name="location" type={isOnlinePreview ? "url" : "text"} defaultValue={event.location} />
    </Field>
    <div className="flex flex-col gap-1.5">
      <Field
        label="Map link"
        optional
        helperText={isOnlinePreview ? "Available only for physical events." : "Paste a Google Maps link so guests can open directions."}
      >
        <Input name="mapLinkUrl" type="url" defaultValue={event.mapLinkUrl ?? ""} disabled={isOnlinePreview} onChange={(e) => setMapLinkPreviewUrl(e.target.value)} />
      </Field>
      {!isOnlinePreview && mapLinkPreviewUrl.trim() ? <p className="text-caption text-ink-muted">Tip: Use a share link so it opens cleanly on mobile.</p> : null}
    </div>
  </FormCard>
  );
}
