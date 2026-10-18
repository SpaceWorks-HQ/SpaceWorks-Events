import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Repeat, ScanLine, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { DotFace } from "@/components/brand/DotFace";
import { CopyOrganisationUrl } from "@/components/org/CopyOrganisationUrl";
import { Button } from "@/components/ui/button";
import { Chip, DateBlock, EmptyState, OrgLogo } from "@/components/ui/display";
import { NavTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatDateBlock, formatDayShort, formatTime } from "@/lib/format/datetime";
import type { OrgCalendar, OrgDashboard, OrgEventRow, OrgEventView, OrgSeriesCard } from "@/lib/orgDashboard";
import { CopyEventLink } from "@/components/dashboard/home/CopyEventLink";
import { DotMeter, meterDots } from "@/components/dashboard/home/DotCharts";

export type OrgQuery = { view: OrgEventView; q: string; pages: number; month: string | undefined };

/** Builds `?…` for this page, keeping the other filters. */
export function orgHref(base: string, query: OrgQuery, change: Partial<OrgQuery>) {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.view !== "upcoming") params.set("view", next.view);
  if (next.q) params.set("q", next.q);
  if (next.pages > 1) params.set("show", String(next.pages));
  if (next.month) params.set("month", next.month);
  const value = params.toString();
  return value ? `${base}?${value}` : base;
}

/* ---------- Banner ---------- */

export function OrgBanner({
  organisation,
  role,
  memberCount,
  actions,
}: {
  organisation: { name: string; slug: string; description: string; logoUrl: string | null };
  role: string;
  memberCount: number;
  actions: ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-line bg-canvas">
      <div aria-hidden className="yy-dot-strip h-20 sm:h-24" />
      <div className="flex flex-col gap-5 px-5 pb-6 sm:px-7 lg:flex-row lg:items-end">
        <OrgLogo name={organisation.name} src={organisation.logoUrl} size="xl" className="-mt-12 border-4 border-canvas" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:pt-5">
          <h1 className="text-h1 text-ink">{organisation.name}</h1>
          {organisation.description.trim() ? <p className="line-clamp-2 max-w-[680px] text-body-ui text-ink-secondary">{organisation.description}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
            <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[13px] text-ink-secondary">/{organisation.slug}</span>
            <CopyOrganisationUrl slug={organisation.slug} />
            <Link href={`/${organisation.slug}`} className="inline-flex items-center gap-1 font-semibold text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
              Public page
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
            <span aria-hidden>·</span>
            <span>
              {role} · {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      </div>
    </header>
  );
}

export function OrgSettingsLink({ href }: { href: string }) {
  return (
    <Button asChild variant="quiet">
      <Link href={href}>
        <Settings aria-hidden className="size-[18px]" />
        Settings
      </Link>
    </Button>
  );
}

/* ---------- Mini calendar ---------- */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function OrgMiniCalendar({ calendar, prevHref, nextHref }: { calendar: OrgCalendar; prevHref: string; nextHref: string }) {
  const summary = [
    calendar.events ? `${calendar.events} event${calendar.events === 1 ? "" : "s"}` : null,
    calendar.seriesDates ? `${calendar.seriesDates} series date${calendar.seriesDates === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" and ");
  return (
    <section aria-labelledby="org-calendar-title" className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="org-calendar-title" className="text-h4 text-ink">{calendar.label}</h2>
        <span className="flex gap-1">
          <Link href={prevHref} scroll={false} aria-label="Previous month" className="inline-flex size-9 items-center justify-center rounded-full border border-line text-ink-secondary hover:bg-subtle">
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
          <Link href={nextHref} scroll={false} aria-label="Next month" className="inline-flex size-9 items-center justify-center rounded-full border border-line text-ink-secondary hover:bg-subtle">
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </span>
      </div>
      <div aria-hidden className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day, index) => (
          <span key={index} className="text-xs font-bold text-ink-muted">{day}</span>
        ))}
        {calendar.cells.map((cell, index) => (
          <span
            key={index}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md py-1 text-[13px]",
              cell.today ? "bg-primary font-bold text-on-primary" : cell.dots.length ? "font-bold text-ink" : "text-ink-muted",
            )}
          >
            {cell.day ?? ""}
            <span className="flex h-[5px] gap-0.5">
              {cell.dots.map((color, dot) => (
                <span key={dot} className="size-[5px] rounded-full" style={{ backgroundColor: cell.today ? "currentColor" : color }} />
              ))}
            </span>
          </span>
        ))}
      </div>
      <p className="text-caption text-ink-muted">{summary ? `${summary} this month.` : "Nothing scheduled this month."}</p>
    </section>
  );
}

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
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-canvas px-4 py-3.5 sm:flex-nowrap", row.isDraft ? "border-[1.5px] border-dashed border-line-strong" : "border border-line")}>
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
              <Link href={row.checkInHref} aria-label={`Open check-in for ${row.title}`} title="Open check-in" className="inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-canvas text-ink hover:bg-subtle">
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
          <label className="flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-canvas px-3.5 focus-within:border-[var(--yy-focus)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--yy-focus)] sm:w-[260px]">
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

/* ---------- Series & team ---------- */

export function OrgSeriesPanel({ base, series, now, action }: { base: string; series: { cards: OrgSeriesCard[]; total: number }; now: Date; action: ReactNode }) {
  return (
    <section id="series" aria-labelledby="org-series-title" className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-line bg-canvas p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="org-series-title" className="text-h4 text-ink">Series</h2>
        {action}
      </div>
      {series.cards.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No recurring series yet. Create one to keep a regular event rhythm.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {series.cards.map((card) => (
            <li key={card.id}>
              <Link href={`${base}/series/${card.id}`} className="flex flex-col gap-1.5 rounded-lg bg-subtle p-3.5 transition-colors hover:bg-emphasis">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip size="sm" icon={<Repeat />}>{card.rule}</Chip>
                  {card.isDraft ? <Chip size="sm" tone="warning">Draft</Chip> : null}
                </span>
                <span className="font-bold text-ink">{card.title}</span>
                <span className="text-caption text-ink-muted">
                  {card.next ? `Next: ${formatDayShort(card.next.start, card.next.timezone, now)} · ${formatTime(card.next.start, card.next.timezone)} · ${card.next.going} going` : "No upcoming dates"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {series.total > series.cards.length ? <p className="text-caption text-ink-muted">Showing {series.cards.length} of {series.total} series.</p> : null}
    </section>
  );
}

export function OrgTeamPanel({ members, membersHref, canInvite }: { members: OrgDashboard["members"]; membersHref: string; canInvite: boolean }) {
  const parts = [
    members.owners ? `${members.owners} ${members.owners === 1 ? "owner" : "owners"}` : null,
    members.admins ? `${members.admins} ${members.admins === 1 ? "admin" : "admins"}` : null,
    members.members ? `${members.members} ${members.members === 1 ? "member" : "members"}` : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="org-team-title" className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="org-team-title" className="text-h4 text-ink">Team</h2>
        <Link href={membersHref} className="text-sm font-semibold text-ink underline-offset-4 hover:underline">Members</Link>
      </div>
      <span aria-hidden className="flex">
        {members.initials.map((initials, index) => (
          <span key={index} className={cn("-ml-1.5 inline-flex size-9 items-center justify-center rounded-full border-2 border-canvas text-xs font-bold first:ml-0", index === 0 ? "bg-primary text-on-primary" : "bg-muted text-ink-secondary")}>
            {initials}
          </span>
        ))}
      </span>
      <p className="text-body-ui text-ink-secondary">{parts.join(" · ")}</p>
      {canInvite ? (
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={membersHref}>Invite people</Link>
        </Button>
      ) : null}
    </section>
  );
}

/* ---------- New organisation ---------- */

export function OrgSetup({
  setup,
  name,
  links,
  createEvent,
}: {
  setup: NonNullable<OrgDashboard["setup"]>;
  name: string;
  links: { settings: string; members: string; publicPage: string };
  createEvent: ReactNode;
}) {
  const steps = [
    { title: "Add your logo and a short description", body: "They appear on your public page and every event page.", done: setup.hasProfile, action: <Button asChild variant="primary"><Link href={links.settings}>Open settings</Link></Button> },
    { title: "Create your first event", body: "Or start a series for a weekly or monthly meetup.", done: setup.hasEvent, action: createEvent },
    { title: "Invite your team", body: "Co-organisers and door volunteers, each with the right access.", done: setup.hasTeam, action: <Button asChild variant="primary"><Link href={links.members}>Invite people</Link></Button> },
    { title: "Share your public page", body: "One link that always lists what is coming up.", done: setup.hasPublished, action: <Button asChild variant="primary"><Link href={links.publicPage}>View public page</Link></Button> },
  ];
  const nextIndex = steps.findIndex((step) => !step.done);
  return (
    <section aria-labelledby="org-setup-title" className="flex flex-col gap-3.5">
      <div className="flex flex-col items-start gap-5 rounded-2xl bg-tint-peach p-6 sm:flex-row sm:items-center">
        <DotFace mood="cheering" size={72} />
        <div className="flex flex-col gap-1">
          <h2 id="org-setup-title" className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{name} is ready</h2>
          <p className="text-body-ui text-ink-secondary">A few steps and your community has its own page, events and team.</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          return (
            <li key={step.title} className={cn("flex flex-col gap-3 rounded-lg px-5 py-4 sm:flex-row sm:items-center sm:gap-4", step.done ? "border border-line bg-subtle" : isNext ? "border-2 border-primary bg-canvas" : "border border-line bg-canvas")}>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", step.done ? "bg-success-bg text-success-fg" : isNext ? "bg-primary text-on-primary" : "bg-muted text-ink-secondary")}>
                {step.done ? <Check aria-label="Done" className="size-4" /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("text-base font-bold", step.done ? "text-ink-muted line-through" : "text-ink")}>{step.title}</span>
                <span className="text-sm text-ink-muted">{step.body}</span>
              </span>
              {isNext ? <span className="shrink-0">{step.action}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
