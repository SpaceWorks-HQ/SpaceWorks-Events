import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { MoodTile } from "@/components/brand/MoodTile";
import { CopyOrganisationUrl } from "@/components/org/CopyOrganisationUrl";
import { Button } from "@/components/ui/button";
import { OrgLogo } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import type { OrgCalendar, OrgDashboard } from "@/lib/orgDashboard";

export { orgHref, type OrgQuery } from "./OrgSections/query";
export { OrgEventList } from "./OrgSections/events";
export { OrgSeriesPanel, OrgTeamPanel } from "./OrgSections/panels";
export { OrgInsightsPanel, OrgRevenuePanel } from "./OrgSections/insights";

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
    <header className="overflow-hidden rounded-xl border border-line bg-panel">
      <div aria-hidden className="yy-dot-strip h-20 sm:h-24" />
      <div className="flex flex-col gap-5 px-5 pb-6 sm:px-7 lg:flex-row lg:items-end">
        <OrgLogo name={organisation.name} src={organisation.logoUrl} size="xl" className="-mt-12 border-4 border-canvas" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:pt-5">
          <h1 className="text-h1 text-ink">{organisation.name}</h1>
          {organisation.description.trim() ? <p className="line-clamp-2 max-w-[680px] text-body-ui text-ink-secondary">{organisation.description}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
            <span className="rounded-full bg-muted px-2.5 py-0.5 tabular-nums text-[13px] text-ink-secondary">/{organisation.slug}</span>
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
    <section aria-labelledby="org-calendar-title" className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
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
      <div className="flex flex-col items-start gap-5 rounded-xl bg-tint-peach p-6 sm:flex-row sm:items-center">
        <MoodTile mood="cheering" size={72} className="yy-face" />
        <div className="flex flex-col gap-1">
          <h2 id="org-setup-title" className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{name} is ready</h2>
          <p className="text-body-ui text-ink-secondary">A few steps and your community has its own page, events and team.</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          return (
            <li key={step.title} className={cn("flex flex-col gap-3 rounded-lg px-5 py-4 sm:flex-row sm:items-center sm:gap-4", step.done ? "border border-line bg-subtle" : isNext ? "border-2 border-primary bg-panel" : "border border-line bg-panel")}>
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
