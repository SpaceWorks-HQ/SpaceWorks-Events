import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { OpenTabButton } from "../EventDashboardTabs";
import { percentOf, type FunnelStep, type SignupTimeline } from "./metrics";

const card = "flex flex-col gap-4 rounded-xl border border-line bg-canvas p-5 sm:p-6";

/** A rounded track with a filled share (0..1). Decorative: the number sits beside it. */
function Bar({ share, tone, className }: { share: number; tone: string; className?: string }) {
  const width = share > 0 ? Math.max(2, Math.round(share * 100)) : 0;
  return (
    <span aria-hidden className={cn("block h-2.5 w-full overflow-hidden rounded-full bg-track", className)}>
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${width}%` }} />
    </span>
  );
}

/* ---------- Key numbers ---------- */

type KeyNumber = { key: string; label: string; value: string; detail: string; tone: string; bar?: number; action?: { tab: string; label: string } };

export function KeyNumbers({ items }: { items: KeyNumber[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-secondary">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", item.tone)} />
            {item.label}
          </span>
          <strong className="font-display text-3xl font-extrabold leading-none text-ink">{item.value}</strong>
          {item.bar != null ? <Bar share={item.bar} tone={item.tone} className="h-1.5" /> : null}
          <span className="text-caption text-ink-muted">{item.detail}</span>
          {item.action ? (
            <OpenTabButton tab={item.action.tab} className="mt-auto inline-flex min-h-8 items-center gap-1 self-start text-sm font-semibold text-ink underline-offset-4 hover:underline">
              {item.action.label} <ArrowRight aria-hidden className="size-4" />
            </OpenTabButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Funnel ---------- */

const FUNNEL_TONE: Record<FunnelStep["key"], string> = {
  responded: "bg-primary",
  going: "bg-accent",
  checkedIn: "bg-success-solid",
  feedback: "bg-brand-marigold",
};

export function FunnelCard({ steps, summary }: { steps: FunnelStep[]; summary: string }) {
  return (
    <section aria-labelledby="analytics-funnel-title" className={card}>
      <div>
        <h2 id="analytics-funnel-title" className="text-h4 text-ink">
          From sign-up to thank-you
        </h2>
        <p className="text-body-ui text-ink-secondary">{summary}</p>
        <p className="text-caption text-ink-muted">Each bar is measured against everyone who responded.</p>
      </div>
      <ol className="flex flex-col gap-5">
        {steps.map((step) => (
          <li key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[11rem_minmax(0,1fr)_11rem]">
            <span className="flex flex-col">
              <span className="font-semibold text-ink">{step.label}</span>
              <span className="text-caption text-ink-muted">{step.hint}</span>
            </span>
            <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
              <Bar share={step.share} tone={FUNNEL_TONE[step.key]} />
            </span>
            <span className="text-right">
              {step.value == null ? (
                <>
                  <span className="font-display text-xl font-extrabold text-ink-muted">—</span> <span className="block text-caption text-ink-muted">after the event</span>
                </>
              ) : (
                <>
                  <strong className="font-display text-xl font-extrabold text-ink">{step.value}</strong>
                  {step.percent != null ? (
                    <span className="block text-caption text-ink-muted">
                      {step.percent}% of {step.of}
                    </span>
                  ) : step.note ? (
                    <span className="block text-caption text-ink-muted">{step.note}</span>
                  ) : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Status mix ---------- */

export type MixPart = { key: string; label: string; hint: string; value: number; tone: string };

export function StatusMixCard({ parts }: { parts: MixPart[] }) {
  const responded = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = parts.filter((part) => part.value > 0);
  return (
    <section aria-labelledby="analytics-mix-title" className={card}>
      <div>
        <h2 id="analytics-mix-title" className="text-h4 text-ink">
          Where every response stands
        </h2>
        <p className="text-caption text-ink-muted">
          {responded} {responded === 1 ? "response" : "responses"} in total, split by status.
        </p>
      </div>
      <span aria-hidden className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full">
        {shown.map((part) => (
          <span key={part.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", part.tone)} style={{ flexGrow: part.value, flexBasis: 0, minWidth: 6 }} />
        ))}
      </span>
      <ul className="flex flex-col divide-y divide-line">
        {parts.map((part) => (
          <li key={part.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 first:pt-0 last:pb-0">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", part.tone)} />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{part.label}</span>
              <span className="text-caption text-ink-muted">{part.hint}</span>
            </span>
            <span className="text-right">
              <strong className="text-ink">{part.value}</strong>
              <span className="block text-caption text-ink-muted">{percentOf(part.value, responded) ?? 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Over time ---------- */

export function TimelineCard({ timeline, busiest, lastWeek }: { timeline: SignupTimeline; busiest: { day: string; count: number } | null; lastWeek: number | null }) {
  const { columns, intervalDays, largest, total, spanDays } = timeline;
  const unit = intervalDays === 1 ? "day" : `${intervalDays} days`;
  const perDay = total / spanDays;
  const average = perDay >= 10 ? Math.round(perDay).toString() : perDay.toFixed(1).replace(/\.0$/, "");
  const middle = Math.floor((columns.length - 1) / 2);
  const stats = [
    { label: "Total sign-ups", value: String(total) },
    { label: "Average per day", value: average },
    lastWeek != null ? { label: "Last 7 days", value: String(lastWeek) } : null,
    busiest && busiest.count > 1 ? { label: `Busiest day · ${busiest.day}`, value: String(busiest.count) } : null,
  ].filter((stat): stat is { label: string; value: string } => stat != null);

  return (
    <section aria-labelledby="analytics-time-title" className={card}>
      <div>
        <h2 id="analytics-time-title" className="text-h4 text-ink">
          When people signed up
        </h2>
        <p className="text-caption text-ink-muted">
          Sign-ups per {unit}, in the event&apos;s timezone. The number above each bar is the exact count.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse gap-0.5">
            <dt className="text-caption text-ink-muted">{stat.label}</dt>
            <dd className="font-display text-xl font-extrabold text-ink">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div aria-hidden className="flex h-40 items-end gap-1 sm:gap-1.5">
        {columns.map((column, index) => (
          <span key={index} title={`${column.label}: ${column.count} sign-up${column.count === 1 ? "" : "s"}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {column.count > 0 ? <span className="text-[11px] font-semibold tabular-nums text-ink-secondary">{column.count}</span> : null}
            <span
              className={cn("w-full max-w-8 rounded-full", column.count > 0 ? "bg-brand-marigold" : "bg-track")}
              style={{ height: column.count > 0 ? `max(6px, ${Math.round((column.count / largest) * 75)}%)` : 6 }}
            />
          </span>
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-3 gap-2 text-[11px] text-ink-muted">
        <span>{columns[0]!.label}</span>
        <span className="text-center">{columns.length > 2 ? columns[middle]!.label : ""}</span>
        <span className="text-right">{columns.length > 1 ? columns[columns.length - 1]!.label : ""}</span>
      </div>

      <table className="sr-only">
        <caption>Sign-ups per {unit}, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column, index) => (
            <tr key={index}>
              <th scope="row">{column.label}</th>
              <td>{column.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
