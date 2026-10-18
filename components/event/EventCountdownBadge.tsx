"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Chip } from "@/components/ui/display";

function countdownLabel(startAt: number, endAt: number, now: number) {
  if (now >= endAt) return { label: "Ended", live: false };
  if (now >= startAt) return { label: "Happening now", live: true };

  let seconds = Math.ceil((startAt - now) / 1_000);
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const time = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return { label: days > 0 ? `${days}d ${time}` : time, live: false };
}

export function EventCountdownBadge(props: { startAt: string; endAt: string }) {
  const { startAt, endAt } = props;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  if (now === null) return null;

  const { label, live } = countdownLabel(new Date(startAt).getTime(), new Date(endAt).getTime(), now);

  return (
    <Chip size="sm" tone={live ? "success" : "outline"} icon={<Clock />}>
      {label}
    </Chip>
  );
}
