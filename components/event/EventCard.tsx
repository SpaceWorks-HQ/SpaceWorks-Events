import Link from "next/link";
import type { Event } from "@prisma/client";
import { EventCountdownBadge } from "@/components/event/EventCountdownBadge";
import { Chip, DateBlock } from "@/components/ui/display";
import { formatDate, formatDateBlock, formatDayShort, formatTimeRange } from "@/lib/format/datetime";
import { cn } from "@/lib/cn";

function formatEventRange(start: Date, end: Date, timeZone: string) {
  const range = formatTimeRange(start, end, timeZone, { withZone: true });
  // Multi-day ranges already include both dates.
  return formatDate(start, timeZone) === formatDate(end, timeZone) ? `${formatDayShort(start, timeZone)}, ${range}` : range;
}

function statusChip(status: Event["status"]) {
  if (status === "DRAFT") return <Chip size="sm" tone="warning">Draft</Chip>;
  if (status === "HIDDEN") return <Chip size="sm" tone="outline">Hidden</Chip>;
  return null;
}

export function EventCard(props: {
  orgSlug: string;
  /** Defaults to public event URL. */
  href?: string;
  /** Denser horizontal presentation for dashboard collections. */
  compact?: boolean;
  event: Pick<
    Event,
    | "title"
    | "slug"
    | "description"
    | "coverImageUrl"
    | "startDateTime"
    | "endDateTime"
    | "timezone"
    | "location"
    | "isOnline"
    | "status"
  > & {
    tags?: string[] | null;
  };
}) {
  const { orgSlug, event, compact = false } = props;
  const href = props.href ?? `/${orgSlug}/${event.slug}`;
  const desc =
    event.description.length > 120
      ? `${event.description.slice(0, 117)}…`
      : event.description;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const date = formatDateBlock(event.startDateTime, event.timezone);
  const draft = event.status === "DRAFT";

  const chips = (
    <div className="flex flex-wrap gap-1.5">
      {statusChip(event.status)}
      <Chip size="sm" tone={event.isOnline ? "neutral" : "outline"}>{event.isOnline ? "Online" : "In person"}</Chip>
      <EventCountdownBadge startAt={event.startDateTime.toISOString()} endAt={event.endDateTime.toISOString()} />
      {tags.slice(0, 3).map((t) => (
        <Chip key={t} size="sm" tone="outline">{t}</Chip>
      ))}
    </div>
  );

  if (compact) {
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-4 rounded-lg border border-line p-4 transition-colors hover:bg-subtle",
          draft ? "bg-subtle" : "bg-canvas",
        )}
      >
        <DateBlock month={date.month} day={date.day} tone={draft ? "draft" : "accent"} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[17px] font-bold leading-snug text-ink">{event.title}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatEventRange(event.startDateTime, event.endDateTime, event.timezone)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          <div className="mt-2">{chips}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-canvas transition-colors hover:bg-subtle">
      {event.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- event covers are served by the app's own upload route
        <img src={event.coverImageUrl} alt="" className="h-[140px] w-full object-cover" />
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5">
        {chips}
        <h3 className="break-words text-title text-ink">{event.title}</h3>
        <p className="text-sm text-ink-muted">{formatEventRange(event.startDateTime, event.endDateTime, event.timezone)}</p>
        {desc ? <p className="text-sm text-ink-secondary">{desc}</p> : null}
      </div>
    </Link>
  );
}
