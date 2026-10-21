import type { ReactNode } from "react";
import type { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import { BROADCAST_PLACEHOLDERS, BROADCAST_STARTER_TEMPLATES } from "@/lib/broadcastTemplate";
import type { BroadcastDesignId } from "@/lib/email/broadcastDesigns";

export type BroadcastHistoryRow = {
  id: string;
  subject: string;
  body: string;
  statuses: RsvpStatus[];
  attendance: BroadcastAttendanceFilter;
  design: BroadcastDesignId;
  recipientCount: number;
  createdAt: string;
  /** Pre-formatted on the server in the event timezone ("3 days ago", "13 Oct 2026"). */
  sentLabel: string;
  createdByName: string | null;
  /** Outbox delivery counts; `expired` once the outbox has purged them. */
  delivery: { sent: number; waiting: number; failed: number; skipped: number; expired: boolean } | null;
};

/** "38 delivered · 2 waiting · 1 failed" for a sent broadcast. */
export function deliverySummary(delivery: BroadcastHistoryRow["delivery"]): string | null {
  if (!delivery) return null;
  if (delivery.expired) return "Delivery details are no longer kept";
  const parts = [
    `${delivery.sent} delivered`,
    delivery.waiting ? `${delivery.waiting} waiting` : null,
    delivery.failed ? `${delivery.failed} failed` : null,
    delivery.skipped ? `${delivery.skipped} skipped (no longer in the audience)` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export const SUBJECT_PLACEHOLDERS = BROADCAST_PLACEHOLDERS.filter((placeholder) => ["{{name}}", "{{event}}", "{{eventDate}}", "{{organisation}}"].includes(placeholder.token));

/** The first cards shown; the rest sit behind "More templates". */
const FEATURED_TEMPLATE_IDS = ["update", "reminder", "know-before-you-go", "agenda", "thank-you"];
export const FEATURED_TEMPLATES = FEATURED_TEMPLATE_IDS.map((id) => BROADCAST_STARTER_TEMPLATES.find((template) => template.id === id)).filter((template) => template !== undefined);
export const MORE_TEMPLATES = BROADCAST_STARTER_TEMPLATES.filter((template) => !FEATURED_TEMPLATE_IDS.includes(template.id));

/** The design's short names for each registration status (the values and server filter are unchanged). */
export const STATUS_PILL_LABEL: Record<RsvpStatus, string> = {
  CONFIRMED: "Going",
  WAITLISTED: "Waitlist",
  PENDING_APPROVAL: "To approve",
  REJECTED: "Declined",
  PENDING_PAYMENT: "Unpaid",
};

export const ATTENDANCE_OPTIONS: ReadonlyArray<{ value: BroadcastAttendanceFilter; label: string; ariaLabel: string }> = [
  { value: "ANY", label: "Everyone", ariaLabel: "Everyone in the selected statuses" },
  { value: "CHECKED_IN", label: "Checked in", ariaLabel: "Only people who checked in" },
  { value: "NOT_CHECKED_IN", label: "Didn't check in", ariaLabel: "Only people who did not check in" },
];

export function StepHeading({ step, id, title, aside }: { step: number; id: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span aria-hidden className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold tabular-nums text-on-primary">{step}</span>
      <h2 id={id} className="text-h4 text-ink">
        <span className="sr-only">Step {step}: </span>
        {title}
      </h2>
      {aside ? <span className="text-sm text-ink-muted">{aside}</span> : null}
    </div>
  );
}

export const cardClass = "flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 sm:p-5";
