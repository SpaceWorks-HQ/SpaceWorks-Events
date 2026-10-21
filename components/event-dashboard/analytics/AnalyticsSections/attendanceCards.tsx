import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format/datetime";
import { percentOf } from "../metrics";
import { Bar, card, ColumnChart, Stats } from "./primitives";

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

/* ---------- Arrivals ---------- */

export type Arrivals = { minutes: number; columns: Array<{ label: string; count: number }>; peak: { label: string; count: number }; first: Date };

export function ArrivalsCard({ arrivals, checkedIn, timeZone }: { arrivals: Arrivals; checkedIn: number; timeZone: string }) {
  const largest = Math.max(...arrivals.columns.map((column) => column.count));
  return (
    <section aria-labelledby="analytics-arrivals-title" className={card}>
      <div>
        <h2 id="analytics-arrivals-title" className="text-h4 text-ink">
          When people arrived
        </h2>
        <p className="text-caption text-ink-muted">Check-ins per {arrivals.minutes} minutes, in the event&apos;s timezone.</p>
      </div>
      <Stats
        items={[
          { label: "Checked in", value: String(checkedIn) },
          { label: "First check-in", value: formatTime(arrivals.first, timeZone) },
          arrivals.peak.count > 1 ? { label: `Busiest · ${arrivals.peak.label}`, value: String(arrivals.peak.count) } : null,
        ]}
      />
      <ColumnChart columns={arrivals.columns} largest={largest} caption={`Check-ins per ${arrivals.minutes} minutes, earliest first`} unit="check-ins" tone="bg-success-solid" />
    </section>
  );
}

/* ---------- How people were checked in ---------- */

export function CheckInMethodsCard({ sources }: { sources: { organiser: number; offline: number; station: number } }) {
  const parts: MixPart[] = [
    { key: "organiser", label: "Check-in desk", hint: "Scanned or searched by the team", value: sources.organiser, tone: "bg-accent-text" },
    { key: "station", label: "Door station", hint: "The PIN-locked volunteer station", value: sources.station, tone: "bg-info-solid" },
    { key: "offline", label: "Offline, synced later", hint: "Checked in without Wi-Fi", value: sources.offline, tone: "bg-highlight" },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <section aria-labelledby="analytics-methods-title" className={card}>
      <div>
        <h2 id="analytics-methods-title" className="text-h4 text-ink">
          How people were checked in
        </h2>
        <p className="text-caption text-ink-muted">Each guest counts once, by the device that last checked them in.</p>
      </div>
      <span aria-hidden className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full">
        {parts
          .filter((part) => part.value > 0)
          .map((part) => (
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
              <span className="block text-caption text-ink-muted">{percentOf(part.value, total) ?? 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Waitlist ---------- */

export function WaitlistCard({ waitlist }: { waitlist: { joined: number; promoted: number; waiting: number; percent: number | null } }) {
  return (
    <section aria-labelledby="analytics-waitlist-title" className={card}>
      <div>
        <h2 id="analytics-waitlist-title" className="text-h4 text-ink">
          Waitlist
        </h2>
        <p className="text-caption text-ink-muted">Everyone who joined the waitlist and is still registered.</p>
      </div>
      <Stats
        items={[
          { label: "Joined the waitlist", value: String(waitlist.joined) },
          { label: "Got a place", value: String(waitlist.promoted) },
          { label: "Still waiting", value: String(waitlist.waiting) },
        ]}
      />
      <div className="flex flex-col gap-1.5">
        <Bar share={waitlist.joined ? waitlist.promoted / waitlist.joined : 0} tone="bg-info-solid" />
        <span className="text-caption text-ink-muted">{waitlist.percent ?? 0}% of the waitlist got a place</span>
      </div>
    </section>
  );
}
