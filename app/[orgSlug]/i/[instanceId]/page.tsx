import { loadRouteMetadata } from "@/lib/views/app__orgSlug__i__instanceId__page";
import { loadInstanceEventView } from "@/lib/views/app__orgSlug__i__instanceId__page";
import type { Metadata } from "next";
import { ArrowRight, Clock } from "lucide-react";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { RsvpForm } from "@/components/rsvp/RsvpForm";
import Link from "next/link";
import { accentStyle, INK_ACCENT } from "@/lib/theme/accent";
import { formatDayLong, formatTimeRange, formatDayShort } from "@/lib/format/datetime";
import { recurrenceChip } from "@/lib/format/recurrence";
import { Button } from "@/components/ui/button";
import { Chip, DateBlock, ProgressBar } from "@/components/ui/display";

type Props = { params: Promise<{ orgSlug: string; instanceId: string; }>; };

export async function generateMetadata({ params }: Props): Promise<Metadata> { return loadRouteMetadata({ params }); }

export default async function InstanceEventPage({ params }: Props) {
  const { org, series, access, dateBlock, instance, timeZone, showRsvp, full, confirmedCount, capacity, spotsLeft, isPast, cancelled, tickets, paidSalesOpen, ticketing, paidRequest } = await loadInstanceEventView({ params });
  return (
    <div style={accentStyle(INK_ACCENT)} className="yy-accent-scope grid gap-10 md:grid-cols-[minmax(0,1fr)_360px] md:gap-14">
      <article className="flex min-w-0 flex-col gap-5">
        <Link href={`/${org.slug}`} className="text-overline text-ink-muted hover:text-ink">{org.name}</Link>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="ink" size="sm">{recurrenceChip(series.recurrenceRule)}</Chip>
          {access.preview && series.status !== EventStatus.PUBLISHED ? <Chip tone="warning" size="sm">Draft preview</Chip> : null}
          {series.privacyType === EventPrivacyType.HIDDEN_LINK ? <Chip size="sm">Hidden link</Chip> : null}
          {series.privacyType === EventPrivacyType.INVITE_ONLY ? <Chip size="sm">Invite only</Chip> : null}
          {series.privacyType === EventPrivacyType.APPROVAL_REQUIRED ? <Chip size="sm">Approval required</Chip> : null}
        </div>
        <h1 className="text-display-l break-words text-ink">{series.title}</h1>
        <div className="flex items-center gap-4">
          <DateBlock month={dateBlock.month} day={dateBlock.day} tone="ink" series />
          <div>
            <p className="text-[17px] font-bold text-ink">{formatDayLong(instance.startDateTime, timeZone)}</p>
            <p className="text-body-ui text-ink-secondary">{formatTimeRange(instance.startDateTime, instance.endDateTime, timeZone, { withZone: true })}</p>
          </div>
        </div>
        <div>
          <Button asChild variant="secondary">
            <Link href={`/${org.slug}/i/${instance.id}/schedule`}>
              <Clock aria-hidden className="size-[18px]" />
              View live schedule
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
        {series.description ? (
          <section aria-labelledby="about-title" className="mt-2">
            <h2 id="about-title" className="mb-2 text-h2 text-ink">About</h2>
            <p className="max-w-[640px] whitespace-pre-wrap text-body-l text-ink-secondary">{series.description}</p>
          </section>
        ) : null}
      </article>

      <aside>
        <section aria-labelledby="join-title" className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5 md:sticky md:top-24">
          <div className="flex items-center justify-between gap-2">
            <h2 id="join-title" className="text-h3 text-ink">Join on {formatDayShort(instance.startDateTime, timeZone)}</h2>
            {showRsvp && full ? <Chip tone="warning">Full</Chip> : null}
          </div>
          {showRsvp ? (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{capacity != null ? `${confirmedCount} / ${capacity} confirmed` : `${confirmedCount} going`}</span>
                  {spotsLeft != null ? <span className="text-ink-muted">{spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left</span> : null}
                </div>
                {capacity != null ? <ProgressBar value={confirmedCount} max={capacity} tone="ink" label="Places taken" /> : null}
                {full ? <p className="text-caption text-ink-muted">Join the waitlist below.</p> : null}
              </div>
              <RsvpForm orgSlug={org.slug} eventInstanceId={instance.id} tickets={tickets} paidSalesOpen={paidSalesOpen} ticketing={ticketing} paidRequest={ticketing?.sellsPaid ? paidRequest : null} />
            </>
          ) : (
            <p className="text-body-ui text-ink-muted">
              {cancelled ? "This date was cancelled." : isPast ? "Registration for this occurrence has ended." : "RSVP opens when the series is published."}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
