import Link from "next/link";
import { ScanLine, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, DateBlock, EmptyState } from "@/components/ui/display";
import { NavTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatDateBlock, formatDayShort, formatTime } from "@/lib/format/datetime";
import type { OrgDashboard, OrgEventRow, OrgEventView } from "@/lib/orgDashboard";
import { CopyEventLink } from "@/components/dashboard/home/CopyEventLink";
import { DotMeter, meterDots } from "@/components/dashboard/home/DotCharts";
import { orgHref, type OrgQuery } from "./query";

/* ---------- Events ---------- */

function OrgEventRowItem({ row, now }: { row: OrgEventRow; now: Date }) {
  const { month, day } = formatDateBlock(row.dateBlock.start, row.dateBlock.timezone);
  const when = `${formatDayShort(row.dateBlock.start, row.dateBlock.timezone, now)} · ${formatTime(row.dateBlock.start, row.dateBlock.timezone)}`;
  const body = (
    <>
      <DateBlock month={month} day={day} size="sm" tone={row.isDraft ? "draft" : "accent"} color={row.isDraft ? undefined : row.accent} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-base font-bold text-ink underline-offset-4 group-hover:underline">{row.title}</span>
        <span className="truncate text-caption text-ink-muted">{row.isDraft ? `Draft · ${when}` : `${when} · ${row.meta}`}</span>
        <span className="flex flex-wrap gap-1.5">
          <Chip size="sm">{row.privacy}</Chip>
          {row.outcome ? null : <Chip size="sm" tone={row.status.tone}>{row.status.label}</Chip>}
        </span>
      </span>
    </>
  );
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-panel px-4 py-3.5 sm:flex-nowrap", row.isDraft ? "border-[1.5px] border-dashed border-line-strong" : "border border-line")}>
      {row.linkable && row.href ? (
        <Link href={row.href} className="group flex min-w-0 flex-1 items-center gap-4 rounded-md">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-4">{body}</span>
      )}
      <span className="flex shrink-0 items-center gap-4">
        {row.outcome ? (
          <span className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="text-sm font-semibold text-ink">{row.outcome.going ? `${row.outcome.came} of ${row.outcome.going} came` : "No one registered"}</span>
            {row.outcome.going ? <DotMeter filled={meterDots(row.outcome.came, row.outcome.going, 10)} total={10} color="var(--yy-success-solid)" /> : null}
            {row.outcome.feedback ? <span className="text-caption text-ink-muted">{row.outcome.feedback} feedback</span> : null}
          </span>
        ) : row.fill ? (
          <DotMeter filled={meterDots(row.fill.filled, row.fill.total, 10)} total={10} color={row.accent} className="hidden sm:flex" />
        ) : null}
        {row.checkInHref || row.publicPath ? (
          <span className="flex gap-1.5">
            {row.checkInHref ? (
              <Link href={row.checkInHref} aria-label={`Open check-in for ${row.title}`} title="Open check-in" className="inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-panel text-ink hover:bg-subtle">
                <ScanLine aria-hidden className="size-[18px]" />
              </Link>
            ) : null}
            {row.publicPath ? <CopyEventLink path={row.publicPath} title={row.title} compact /> : null}
          </span>
        ) : null}
      </span>
    </li>
  );
}

const VIEW_LABELS: Record<OrgEventView, string> = { upcoming: "Upcoming", draft: "Drafts", past: "Past" };
const EMPTY_TEXT: Record<OrgEventView, string> = {
  upcoming: "Nothing coming up yet.",
  draft: "No drafts. Everything is published.",
  past: "No past events yet.",
};

export function OrgEventList({
  base,
  query,
  events,
  showDrafts,
  now,
}: {
  base: string;
  query: OrgQuery;
  events: OrgDashboard["events"];
  showDrafts: boolean;
  now: Date;
}) {
  const views: OrgEventView[] = showDrafts ? ["upcoming", "draft", "past"] : ["upcoming", "past"];
  return (
    <section aria-labelledby="org-events-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="org-events-title" className="text-h4 text-ink">Events</h2>
        <form action={base} method="get" role="search" className="w-full sm:w-auto">
          {events.view !== "upcoming" ? <input type="hidden" name="view" value={events.view} /> : null}
          {query.month ? <input type="hidden" name="month" value={query.month} /> : null}
          <label className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-panel px-3.5 focus-within:border-[var(--yy-focus)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--yy-focus)] sm:w-[260px]">
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <span className="sr-only">Search events</span>
            <input type="search" name="q" defaultValue={query.q} placeholder="Search events" maxLength={100} className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
          </label>
        </form>
      </div>
      <NavTabs
        label="Filter events"
        items={views.map((view) => ({
          href: orgHref(base, query, { view, pages: 1 }),
          label: (
            <>
              {VIEW_LABELS[view]} <span className="font-medium text-ink-muted">{events.counts[view]}</span>
            </>
          ),
          active: events.view === view,
        }))}
      />
      {events.rows.length === 0 ? (
        <EmptyState mood="sleepy" title={query.q ? `No events match “${query.q}”.` : EMPTY_TEXT[events.view]} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {events.rows.map((row) => (
            <OrgEventRowItem key={row.key} row={row} now={now} />
          ))}
        </ul>
      )}
      {events.hasMore ? (
        <Button asChild variant="secondary" className="self-center">
          <Link href={orgHref(base, query, { pages: query.pages + 1 })} scroll={false}>
            Show more events
          </Link>
        </Button>
      ) : events.rows.length > 0 ? (
        <p className="text-center text-caption text-ink-muted">
          {events.total} {events.total === 1 ? "event" : "events"}
        </p>
      ) : null}
    </section>
  );
}
