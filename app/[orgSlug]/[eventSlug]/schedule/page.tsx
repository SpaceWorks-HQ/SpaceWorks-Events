import { loadEventScheduleView } from "@/lib/views/app__orgSlug__eventSlug__schedule__page";
import Link from "next/link";
import { accentStyle } from "@/lib/theme/accent";
import { formatDayLong, formatTime } from "@/lib/format/datetime";
import { Breadcrumb } from "@/components/event/Breadcrumb";
import { Chip, EmptyState } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event programme" };

export default async function EventSchedulePage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; }>; }) {
  const { event, org, zone, tracks } = await loadEventScheduleView({ params });
  return (
    <div style={accentStyle(event.page?.accentColor)} className="yy-accent-scope flex flex-col gap-6">
      <Breadcrumb items={[{ label: event.title, href: `/${org.slug}/${event.slug}` }, { label: "Programme" }]} />
      <header>
        <h1 className="text-display-m text-ink">Programme</h1>
        <p className="mt-3 text-body-ui text-ink-muted">{formatDayLong(event.startDateTime, event.timezone)} · all times {zone}</p>
      </header>

      {tracks.length === 0 ? (
        <EmptyState title="The programme hasn’t been published yet">Check back soon for sessions and speakers.</EmptyState>
      ) : (
        <div className={cn("grid gap-5", tracks.length > 1 && "md:grid-cols-2", tracks.length > 2 && "lg:grid-cols-3")}>
          {tracks.map((track, trackIndex) => (
            <section key={track.id} aria-labelledby={`track-${track.id}`} className="flex flex-col gap-3">
              <h2 id={`track-${track.id}`} className="flex items-center gap-2 font-sans text-[17px] font-bold text-ink">
                <span aria-hidden className={cn("size-2.5 rounded-full", trackIndex === 0 ? "bg-accent" : "bg-ink-muted")} />
                {track.name}
              </h2>
              <ol className="flex flex-col gap-2.5">
                {track.sessions.map((session) => {
                  const late = session.cumulativeDelayMinutes > 0;
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/${org.slug}/${event.slug}/sessions/${session.slug}`}
                        className={cn("block rounded-lg p-4 transition-colors", trackIndex === 0 ? "bg-accent-soft hover:brightness-[0.98]" : "bg-muted hover:bg-emphasis")}
                      >
                        <p className={cn("text-[13px] font-bold", trackIndex === 0 ? "text-accent-text" : "text-ink-secondary")}>
                          {formatTime(session.effectiveStartDateTime, event.timezone)} – {formatTime(session.effectiveEndDateTime, event.timezone)}
                          {session.type ? ` · ${session.type}` : ""}
                        </p>
                        <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{session.title}</p>
                        {session.speakers.length > 0 ? <p className="mt-0.5 text-sm text-ink-secondary">{session.speakers.map((item) => item.speaker.name).join(", ")}</p> : null}
                        {late ? <Chip tone="warning" size="sm" className="mt-2">Running {session.cumulativeDelayMinutes} min late</Chip> : null}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
