"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { cn } from "@/lib/cn";
import { INK_ACCENT } from "@/lib/theme/accent";
import { describeRecurrence, recurrenceChip } from "@/lib/format/recurrence";
import type { PublicOrgEvent, PublicOrgInstance } from "@/lib/publicOrgEventDto";
import { PublicEventRow, type PublicEventSummary } from "@/components/events/PublicEventCard";
import { EmptyState } from "@/components/ui/display";
import { IconButton } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";

type MergedItem =
  | { kind: "event"; id: string; createdAt: Date; startDateTime: Date; endDateTime: Date; title: string; description: string | null; event: PublicOrgEvent }
  | { kind: "instance"; id: string; createdAt: Date; startDateTime: Date; endDateTime: Date; title: string; description: string | null; instance: PublicOrgInstance };

type OrgEventsContainerProps = {
  orgSlug: string;
  organisationName: string;
  initialNow: string;
  items: MergedItem[];
  /** Confirmed counts keyed by event id, present only where the organiser shows counts. */
  goingCounts?: Record<string, number>;
};

function toSummary(item: MergedItem, orgSlug: string, goingCounts: Record<string, number>): PublicEventSummary {
  if (item.kind === "event") {
    return {
      href: `/${orgSlug}/${item.event.slug}`,
      title: item.event.title,
      startDateTime: new Date(item.event.startDateTime),
      timezone: item.event.timezone,
      location: item.event.location,
      isOnline: item.event.isOnline,
      coverImageUrl: item.event.coverImageUrl,
      accentColor: item.event.page?.accentColor,
      tagline: item.event.page?.tagline || null,
      goingCount: item.event.showRegistrationCount ? goingCounts[item.event.id] ?? 0 : null,
    };
  }
  return {
    href: `/${orgSlug}/i/${item.instance.id}`,
    title: item.instance.series.title,
    startDateTime: new Date(item.instance.startDateTime),
    timezone: item.instance.series.timezone,
    fallbackAccent: INK_ACCENT,
    tagline: item.instance.series.description || null,
    recurrenceChip: recurrenceChip(item.instance.series.recurrenceRule),
    recurrenceText: describeRecurrence(item.instance.series.recurrenceRule),
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function OrgEventsContainer({ orgSlug, initialNow, items, goingCounts = {} }: OrgEventsContainerProps) {
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // Use the server snapshot for the initial render so event grouping hydrates
  // consistently, then adopt the browser's clock after hydration.
  const [now, setNow] = useState(() => new Date(initialNow));
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const localNow = new Date();
      setNow(localNow);
      setCurrentMonth(localNow.getMonth());
      setCurrentYear(localNow.getFullYear());
      setSelectedDay(localNow.getDate());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const upcoming = items.filter((item) => new Date(item.startDateTime) >= now).sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const past = items.filter((item) => new Date(item.startDateTime) < now).sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime());
  const filteredItems = activeTab === "upcoming" ? upcoming : past;

  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startDayOfWeek = startOfMonth.getDay();
  const monthName = startOfMonth.toLocaleString("en-GB", { month: "long" });

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((year) => year - 1);
    } else {
      setCurrentMonth((month) => month - 1);
    }
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((year) => year + 1);
    } else {
      setCurrentMonth((month) => month + 1);
    }
    setSelectedDay(null);
  };

  const getEventsForDay = (dayNum: number) =>
    filteredItems.filter((item) => {
      const date = new Date(item.startDateTime);
      return date.getFullYear() === currentYear && date.getMonth() === currentMonth && date.getDate() === dayNum;
    });
  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  const tabs = [
    { key: "upcoming" as const, label: "Upcoming", count: upcoming.length },
    { key: "past" as const, label: "Past", count: past.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col-reverse gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label="Event timeframe" className="flex gap-1">
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative inline-flex min-h-11 items-center px-3.5 text-[15px] font-semibold transition-colors after:absolute after:inset-x-3.5 after:-bottom-px after:h-0.5 after:rounded-full",
                  selected ? "text-ink after:bg-primary" : "text-ink-muted hover:text-ink after:bg-transparent",
                )}
              >
                {tab.label} · {tab.count}
              </button>
            );
          })}
        </div>
        <SegmentedControl
          ariaLabel="View mode"
          value={viewMode}
          onValueChange={setViewMode}
          size="sm"
          className="mb-2 self-end"
          options={[
            { value: "list", label: "List", icon: <List aria-hidden /> },
            { value: "calendar", label: "Calendar", icon: <CalendarDays aria-hidden /> },
          ]}
        />
      </div>

      {viewMode === "list" ? (
        filteredItems.length === 0 ? (
          <EmptyState title="No events found">There are no {activeTab} events listed at the moment.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {filteredItems.map((item) => (
              <li key={item.id}>
                <PublicEventRow event={toSummary(item, orgSlug, goingCounts)} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-label="Calendar" className="rounded-lg border border-line bg-canvas p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-h4 text-ink">{monthName} {currentYear}</h2>
              <div className="flex gap-1.5">
                <IconButton label="Previous month" variant="secondary" size="sm" onClick={prevMonth}><ChevronLeft /></IconButton>
                <IconButton label="Next month" variant="secondary" size="sm" onClick={nextMonth}><ChevronRight /></IconButton>
              </div>
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-md border border-line">
              {WEEKDAYS.map((day) => (
                <div key={day} className="border-b border-line bg-subtle py-2 text-center text-xs font-bold text-ink-muted">{day}</div>
              ))}
              {Array.from({ length: startDayOfWeek }, (_, index) => (
                <div key={`empty-${index}`} className="min-h-[52px] border-b border-r border-line md:min-h-[110px]" />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const dayNum = index + 1;
                const dayEvents = getEventsForDay(dayNum);
                const hasEvents = dayEvents.length > 0;
                const isSelected = selectedDay === dayNum;
                const isToday = now.getDate() === dayNum && now.getMonth() === currentMonth && now.getFullYear() === currentYear;
                return (
                  <div
                    key={dayNum}
                    className={cn(
                      "relative min-h-[52px] border-b border-r border-line p-1.5 md:min-h-[110px]",
                      isSelected ? "bg-emphasis" : hasEvents ? "bg-subtle" : "bg-canvas",
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`Show events on ${dayNum} ${monthName} ${currentYear}${hasEvents ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ", no events"}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedDay(dayNum)}
                      className={cn(
                        "mb-1 inline-flex size-7 items-center justify-center rounded-full text-[13px]",
                        isToday ? "bg-primary font-bold text-on-primary" : hasEvents ? "font-bold text-ink" : "text-ink-muted",
                      )}
                    >
                      {dayNum}
                    </button>
                    <div className="hidden flex-col gap-1 md:flex">
                      {dayEvents.map((item) => (
                        <Link
                          key={item.id}
                          href={item.kind === "event" ? `/${orgSlug}/${item.event.slug}` : `/${orgSlug}/i/${item.instance.id}`}
                          className="truncate rounded-[6px] bg-muted px-1.5 py-1 text-[11px] font-semibold text-ink hover:bg-emphasis"
                        >
                          {item.title}
                        </Link>
                      ))}
                    </div>
                    {hasEvents ? (
                      <div aria-hidden className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1 md:hidden">
                        {dayEvents.slice(0, 3).map((item) => <span key={item.id} className="size-1.5 rounded-full bg-primary" />)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {selectedDay ? (
            <section aria-live="polite" className="flex flex-col gap-3">
              <h3 className="text-h4 text-ink">Events on {selectedDay} {monthName} {currentYear}</h3>
              {selectedDayEvents.length === 0 ? (
                <p className="text-body-ui text-ink-muted">No events scheduled for this date.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {selectedDayEvents.map((item) => (
                    <li key={item.id}>
                      <PublicEventRow event={toSummary(item, orgSlug, goingCounts)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
