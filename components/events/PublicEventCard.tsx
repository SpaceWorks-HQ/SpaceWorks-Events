import Link from "next/link";
import { cn } from "@/lib/cn";
import { accentStyle, DEFAULT_EVENT_ACCENT, INK_ACCENT } from "@/lib/theme/accent";
import { formatDateBlock, formatDayShort, formatTime } from "@/lib/format/datetime";
import { Chip, DateBlock } from "@/components/ui/display";

export type PublicEventSummary = {
  href: string;
  title: string;
  startDateTime: Date;
  timezone: string;
  location?: string | null;
  isOnline?: boolean;
  coverImageUrl?: string | null;
  accentColor?: string | null;
  /** Ink for series and organisations without an accent; Ember for events. */
  fallbackAccent?: string;
  organisationName?: string;
  tagline?: string | null;
  /** Shown only when the organiser allows registration counts. */
  goingCount?: number | null;
  /** Attendee-facing recurrence, e.g. "Weekly" / "Every Tuesday". */
  recurrenceChip?: string | null;
  recurrenceText?: string | null;
};

function locationText(event: PublicEventSummary) {
  if (event.isOnline) return "Online";
  return event.location?.trim() || null;
}

/** Cover band in the event's accent (or its cover image), never a broken image. */
function Cover({ event, className }: { event: PublicEventSummary; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {event.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers are served by the app's own upload route
        <img src={event.coverImageUrl} alt="" className="size-full object-cover" />
      ) : (
        <div aria-hidden className="yy-cover-placeholder size-full" />
      )}
    </div>
  );
}

/** Discover grid card (docs/DESIGN.md §4.7). */
export function PublicEventCard({ event, headingLevel = "h3" }: { event: PublicEventSummary; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const block = formatDateBlock(event.startDateTime, event.timezone);
  const place = locationText(event);
  const meta = [formatDayShort(event.startDateTime, event.timezone), formatTime(event.startDateTime, event.timezone), event.recurrenceText ? event.recurrenceText.toLowerCase() : place].filter(Boolean).join(" · ");
  return (
    <Link href={event.href} style={accentStyle(event.accentColor, event.fallbackAccent ?? DEFAULT_EVENT_ACCENT)} className="yy-accent-scope group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-canvas transition-colors hover:bg-subtle">
      <Cover event={event} className="h-[150px]" />
      <div className="relative flex flex-1 flex-col gap-2 px-[18px] pb-4">
        <DateBlock month={block.month} day={block.day} className="-mt-[22px] self-start shadow-segment" />
        <div className="flex flex-wrap gap-1.5">
          <Chip size="sm">{event.isOnline ? "Online" : "In person"}</Chip>
          {event.recurrenceChip ? <Chip size="sm">{event.recurrenceChip}</Chip> : <Chip size="sm">Free</Chip>}
        </div>
        <Heading className="font-display text-[22px] font-extrabold leading-tight text-ink">{event.title}</Heading>
        <p className="text-body-ui text-ink-secondary">{meta}</p>
        {event.organisationName || event.goingCount != null ? (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-2.5 text-sm text-ink-muted">
            <span className="min-w-0 truncate">{event.organisationName}</span>
            {event.goingCount != null ? <span className="shrink-0">{event.goingCount} going</span> : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/** Organisation page list row (docs/DESIGN.md §4.7 "Event row"). */
export function PublicEventRow({ event }: { event: PublicEventSummary }) {
  const when = event.recurrenceText
    ? `${event.recurrenceText} · ${formatTime(event.startDateTime, event.timezone)}`
    : `${formatDayShort(event.startDateTime, event.timezone)} · ${formatTime(event.startDateTime, event.timezone)}`;
  const kind = event.isOnline ? "Online" : "In person";
  return (
    <Link href={event.href} style={accentStyle(event.accentColor, event.fallbackAccent ?? INK_ACCENT)} className="yy-accent-scope flex flex-col gap-4 rounded-lg border border-line bg-canvas p-4 transition-colors hover:bg-subtle sm:flex-row sm:items-center">
      <Cover event={event} className="aspect-[2/1] w-full shrink-0 rounded-md sm:h-[110px] sm:w-[180px]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-accent-text">{when}</p>
        <h3 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight text-ink">{event.title}</h3>
        {event.tagline ? <p className="mt-1 line-clamp-2 text-body-ui text-ink-secondary">{event.tagline}</p> : null}
      </div>
      <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
        <Chip size="sm">{event.recurrenceChip ? `${kind} · ${event.recurrenceChip.toLowerCase()}` : kind}</Chip>
        {event.goingCount != null ? <span className="text-sm text-ink-muted">{event.goingCount} going</span> : null}
      </div>
    </Link>
  );
}
