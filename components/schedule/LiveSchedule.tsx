"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTime, formatTimeZoneName } from "@/lib/format/datetime";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";

function progress(now: number, start: Date, end: Date) {
  const span = end.getTime() - start.getTime();
  return span > 0 ? Math.min(100, Math.max(0, ((now - start.getTime()) / span) * 100)) : 0;
}

type LiveItem = { id: string; title: string; description: string; effectiveStart: string; effectiveEnd: string; cumulativeDelayMinutes?: number };

export function LiveSchedule({ items, timeZone }: { items: LiveItem[]; timeZone: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const refresh = window.setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);
  const rows = useMemo(() => items.map((item) => ({ ...item, start: new Date(item.effectiveStart), end: new Date(item.effectiveEnd) })), [items]);

  const firstUpcoming = rows.findIndex((item) => now < item.start.getTime());
  const zone = rows[0] ? formatTimeZoneName(rows[0].start, timeZone) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-secondary">
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-solid opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2.5 rounded-full bg-success-solid" />
        </span>
        Live · updates automatically
      </p>
      <ol className="flex flex-col gap-3">
        {rows.map((item, index) => {
          const live = now >= item.start.getTime() && now < item.end.getTime();
          const complete = now >= item.end.getTime();
          const next = index === firstUpcoming;
          const label = live ? "Now" : complete ? "Completed" : next ? "Next" : "Later";
          const late = (item.cumulativeDelayMinutes ?? 0) > 0;
          const minutesLeft = Math.max(0, Math.ceil((item.end.getTime() - now) / 60_000));
          return (
            <li
              key={item.id}
              aria-current={live ? "step" : undefined}
              className={cn(
                "rounded-lg p-5",
                live ? "bg-accent text-on-accent shadow-md" : "border border-line bg-canvas",
                complete && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={cn("text-overline", live ? "text-on-accent/85" : next ? "text-accent-text" : "text-ink-muted")}>{label}</p>
                {late && !complete ? <Chip tone={live ? "ink" : "warning"} size="sm">Running {item.cumulativeDelayMinutes} min late</Chip> : null}
              </div>
              <p className={cn("mt-1 text-sm font-bold", live ? "text-on-accent/90" : "text-ink-secondary")}>
                {formatTime(item.start, timeZone)} – {formatTime(item.end, timeZone)}
              </p>
              <p className={cn("mt-1 font-display text-[22px] font-bold leading-tight", live ? "text-on-accent" : "text-ink")}>{item.title}</p>
              {item.description ? <p className={cn("mt-1.5 whitespace-pre-wrap text-body-ui", live ? "text-on-accent/90" : "text-ink-secondary")}>{item.description}</p> : null}
              {live ? (
                <div className="mt-4 flex items-center gap-3">
                  <div role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress(now, item.start, item.end))} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/30">
                    <div className="h-full rounded-full bg-white" style={{ width: `${progress(now, item.start, item.end)}%` }} />
                  </div>
                  <span className="text-sm font-semibold">{minutesLeft} min left</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {zone ? <p className="text-caption text-ink-muted">All times {zone}.</p> : null}
    </div>
  );
}
