import { cn } from "@/lib/cn";

export const card = "flex flex-col gap-4 rounded-xl border border-line bg-panel p-5 sm:p-6";

/** A rounded track with a filled share (0..1). Decorative: the number sits beside it. */
export function Bar({ share, tone, className }: { share: number; tone: string; className?: string }) {
  const width = share > 0 ? Math.max(2, Math.round(share * 100)) : 0;
  return (
    <span aria-hidden className={cn("block h-2.5 w-full overflow-hidden rounded-full bg-track", className)}>
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${width}%` }} />
    </span>
  );
}

/* ---------- Shared column chart ---------- */

/** Bars with exact counts on top, three axis labels and a screen-reader table. */
export function ColumnChart({ columns, largest, caption, unit, tone = "bg-accent-text", format = String }: { columns: Array<{ label: string; count: number }>; largest: number; caption: string; unit: string; tone?: string; format?: (value: number) => string }) {
  const middle = Math.floor((columns.length - 1) / 2);
  return (
    <>
      <div aria-hidden className="flex h-40 items-end gap-1 sm:gap-1.5">
        {columns.map((column, index) => (
          <span key={index} title={`${column.label}: ${format(column.count)} ${unit}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {column.count > 0 ? <span className="text-[11px] font-semibold tabular-nums text-ink-secondary">{format(column.count)}</span> : null}
            <span className={cn("w-full max-w-8 rounded-full", column.count > 0 ? tone : "bg-track")} style={{ height: column.count > 0 ? `max(6px, ${Math.round((column.count / Math.max(1, largest)) * 75)}%)` : 6 }} />
          </span>
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-3 gap-2 text-[11px] text-ink-muted">
        <span>{columns[0]?.label}</span>
        <span className="text-center">{columns.length > 2 ? columns[middle]!.label : ""}</span>
        <span className="text-right">{columns.length > 1 ? columns[columns.length - 1]!.label : ""}</span>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column, index) => (
            <tr key={index}>
              <th scope="row">{column.label}</th>
              <td>{format(column.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Stats({ items }: { items: Array<{ label: string; value: string } | null> }) {
  const shown = items.filter((item): item is { label: string; value: string } => item != null);
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {shown.map((stat) => (
        <div key={stat.label} className="flex flex-col-reverse gap-0.5">
          <dt className="text-caption text-ink-muted">{stat.label}</dt>
          <dd className="font-display text-xl font-semibold text-ink">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
