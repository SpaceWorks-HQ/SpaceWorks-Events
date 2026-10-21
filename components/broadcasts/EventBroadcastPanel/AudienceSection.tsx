"use client";

import type { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Tooltip } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { BROADCAST_STATUS_OPTIONS } from "@/lib/broadcastTemplate";
import { recipientDots, recipientSummary } from "@/components/event-dashboard/emails/recipients";
import { ATTENDANCE_OPTIONS, STATUS_PILL_LABEL, StepHeading, cardClass } from "./shared";

export function AudienceSection({ statuses, attendance, setAttendance, toggleStatus, statusCounts, pending, reach, summary, countError, recipientCount, audienceText }: {
  statuses: RsvpStatus[];
  attendance: BroadcastAttendanceFilter;
  setAttendance: (value: BroadcastAttendanceFilter) => void;
  toggleStatus: (value: RsvpStatus) => void;
  statusCounts: Record<RsvpStatus, number>;
  pending: boolean;
  reach: ReturnType<typeof recipientDots>;
  summary: ReturnType<typeof recipientSummary>;
  countError: string | null;
  recipientCount: number | null;
  audienceText: string;
}) {
  return (
    <section aria-labelledby="broadcast-step-audience" className={cardClass}>
      <StepHeading step={2} id="broadcast-step-audience" title="Who gets it" />
      <div role="group" aria-label="Registration status" className="flex flex-wrap gap-1.5">
        {BROADCAST_STATUS_OPTIONS.map((option) => {
          const selected = statuses.includes(option.value);
          return (
            <Tooltip key={option.value} content={`${option.label}: ${option.hint}`}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => toggleStatus(option.value)}
                disabled={pending}
                className={cn(
                  "inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-[180ms] ease-yy disabled:pointer-events-none disabled:border-line disabled:bg-surface disabled:text-ink-muted",
                  selected ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-panel text-ink hover:bg-subtle",
                )}
              >
                {STATUS_PILL_LABEL[option.value]}
                <span className="font-medium tabular-nums">{statusCounts[option.value] ?? 0}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      <SegmentedControl
        ariaLabel="Attendance"
        size="sm"
        value={attendance}
        onValueChange={(value) => setAttendance(value)}
        options={ATTENDANCE_OPTIONS}
        className="max-w-full self-start"
      />
      <div aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-subtle px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3">
        <span aria-hidden className="flex w-full max-w-[160px] shrink-0 flex-wrap gap-[3px]">
          {Array.from({ length: reach.dots }, (_, index) => (
            <span key={index} className={cn("size-[7px] rounded-full", index < reach.lit ? "bg-accent" : "bg-track")} />
          ))}
        </span>
        {countError ? (
          <Callout tone="danger" className="flex-1">{countError}</Callout>
        ) : (
          <p className="text-sm text-ink">
            {summary.count ? <strong className="font-bold">{summary.count}</strong> : null} {summary.rest}
            {recipientCount !== null && recipientCount > 0 ? <span className="block text-caption text-ink-muted">Matches {audienceText}. Someone who registered twice still gets one email.</span> : null}
          </p>
        )}
      </div>
    </section>
  );
}
