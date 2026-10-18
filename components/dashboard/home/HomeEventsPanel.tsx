"use client";

import Link from "next/link";
import { Chip, DateBlock, EmptyState } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { DotMeter, meterDots } from "./DotCharts";

/** A dashboard event row, already formatted on the server. */
export type HomeEventRowView = {
  key: string;
  /** Null when the person cannot manage this event; the row is then not a link. */
  href: string | null;
  title: string;
  month: string;
  day: string;
  meta: string;
  organisationName: string | null;
  accent: string;
  isSeries: boolean;
  isDraft: boolean;
  status: { label: string; tone: "success" | "warning" | "neutral" };
  fill: { filled: number; total: number } | null;
};

function EventRow({ row }: { row: HomeEventRowView }) {
  const className = cn(
    "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-canvas px-4 py-3.5 sm:flex-nowrap",
    row.href && "transition-colors hover:bg-subtle",
    row.isDraft ? "border-[1.5px] border-dashed border-line-strong" : "border border-line",
  );
  const content = (
    <>
      <DateBlock month={row.month} day={row.day} size="sm" series={row.isSeries} tone={row.isDraft ? "draft" : "accent"} color={row.isDraft ? undefined : row.accent} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-bold text-ink">{row.title}</span>
        <span className="truncate text-caption text-ink-muted">
          {row.meta}
          {row.organisationName ? ` · ${row.organisationName}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <Chip tone={row.status.tone} size="sm">{row.status.label}</Chip>
        {row.fill ? <DotMeter filled={meterDots(row.fill.filled, row.fill.total, 10)} total={10} color={row.accent} /> : null}
      </span>
    </>
  );
  return (
    <li>
      {row.href ? (
        <Link href={row.href} className={className}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}

function RowList({ rows, empty }: { rows: HomeEventRowView[]; empty: string }) {
  if (rows.length === 0) return <EmptyState mood="sleepy" title={empty} />;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <EventRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

export function HomeEventsPanel({
  upcoming,
  drafts,
  past,
  counts,
  showDrafts,
}: {
  upcoming: HomeEventRowView[];
  drafts: HomeEventRowView[];
  past: HomeEventRowView[];
  counts: { upcoming: number; drafts: number };
  showDrafts: boolean;
}) {
  return (
    <section aria-labelledby="home-events-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="home-events-title" className="text-h4 text-ink">Your events</h2>
      <Tabs defaultValue="upcoming">
        <TabsList aria-label="Filter events">
          <TabsTrigger value="upcoming">Upcoming <span className="text-ink-muted">{counts.upcoming}</span></TabsTrigger>
          {showDrafts ? <TabsTrigger value="drafts">Drafts <span className="text-ink-muted">{counts.drafts}</span></TabsTrigger> : null}
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="pt-4">
          <RowList rows={upcoming} empty="Nothing coming up yet" />
        </TabsContent>
        {showDrafts ? (
          <TabsContent value="drafts" className="pt-4">
            <RowList rows={drafts} empty="No drafts. Everything is published." />
          </TabsContent>
        ) : null}
        <TabsContent value="past" className="pt-4">
          <RowList rows={past} empty="No past events yet" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
