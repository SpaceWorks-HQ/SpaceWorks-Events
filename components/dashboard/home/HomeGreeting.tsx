"use client";

import { useSyncExternalStore } from "react";
import { formatDayLong, viewerTimeZone } from "@/lib/format/datetime";

const subscribe = () => () => {};

function greetingFor(hour: number | null) {
  if (hour == null) return "Welcome back";
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Time-of-day greeting and today's date in the viewer's own timezone. The
 * server renders a neutral "Welcome back"; the browser fills in the rest.
 */
export function HomeGreeting({ name }: { name: string }) {
  const hour = useSyncExternalStore(subscribe, () => new Date().getHours(), () => null);
  const today = useSyncExternalStore(subscribe, () => formatDayLong(new Date(), viewerTimeZone()), () => null);
  return (
    <>
      <p className="min-h-[1.5em] text-body-ui text-ink-muted">{today ?? " "}</p>
      <h1 className="text-h1 text-ink">
        {greetingFor(hour)}, {name}
      </h1>
    </>
  );
}
