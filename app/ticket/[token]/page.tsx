import { loadRouteMetadata } from "@/lib/views/app__ticket__token__page";
import { loadTicketView } from "@/lib/views/app__ticket__token__page";
import type { Metadata } from "next";
import Link from "next/link";
import { MoodTile } from "@/components/brand/MoodTile";
import { ArrowLeft, ArrowUpRight, CalendarPlus, Check } from "lucide-react";
import { TicketQrPanel } from "@/components/ticket/TicketQrPanel";
import { CancelRsvpButton } from "@/components/ticket/CancelRsvpButton";
import { TicketDownloadButton } from "@/components/ticket/TicketDownloadButton";
import { TicketStatusStorageSync } from "@/components/ticket/TicketStatusStorageSync";
import { HideAfterLiveCheckIn, LiveCheckedInChip, LiveTicketCard, LiveTicketProvider } from "@/components/ticket/LiveTicket";
import { googleCalendarEventUrl } from "@/lib/calendarInvite";
import { accentStyle } from "@/lib/theme/accent";
import { formatDayShort, formatTime, formatTimeZoneName } from "@/lib/format/datetime";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";

type Props = {
  params: Promise<{ token: string; }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> { return loadRouteMetadata({ params }); }

export default async function TicketPage({ params }: Props) {
  const { rsvp, orgName, title, start, timeZone, location, mapHref, accent, calendarEvent, status, isCheckedIn, confirmed, name, eventPageHref } = await loadTicketView({ params });
  const ticketMain = (
    <>
      <header className="bg-accent px-6 py-5 text-on-accent">
        <p className="text-sm font-semibold opacity-90">{orgName}</p>
        <h1 className="mt-1 break-words text-[26px] font-semibold leading-tight tracking-[-0.02em] text-on-accent">{title}</h1>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-6 py-5">
        <div>
          <dt className="text-overline text-ink-muted">Date</dt>
          <dd className="text-[15px] font-bold text-ink">{formatDayShort(start, timeZone)}</dd>
        </div>
        <div>
          <dt className="text-overline text-ink-muted">Time</dt>
          <dd className="text-[15px] font-bold text-ink">{formatTime(start, timeZone)} {formatTimeZoneName(start, timeZone)}</dd>
        </div>
        {location ? (
          <div className="col-span-2">
            <dt className="text-overline text-ink-muted">Venue</dt>
            <dd className="break-words text-[15px] font-bold text-ink">
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 decoration-accent hover:underline focus-visible:underline"
                >
                  {location}
                  <ArrowUpRight aria-hidden className="ml-0.5 inline-block size-4 align-[-2px] text-ink-muted" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                location
              )}
            </dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-overline text-ink-muted">Guest</dt>
          <dd className="break-words text-[15px] font-bold text-ink">{name}</dd>
        </div>
      </dl>
    </>
  );

  return (
    <LiveTicketProvider
      token={rsvp.checkInToken}
      initialCheckedIn={isCheckedIn}
      initialCheckedInAt={rsvp.checkedInAt?.toISOString() ?? null}
      enabled={confirmed && !isCheckedIn}
    >
      <TicketStatusStorageSync checkInToken={rsvp.checkInToken} status={rsvp.status} />
      <div style={accentStyle(accent)} className="yy-accent-scope mx-auto flex w-full max-w-[400px] flex-col gap-4 py-2 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <Link href={eventPageHref} className="inline-flex min-h-10 items-center gap-1.5 text-[15px] font-semibold text-ink-secondary hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            Event page
          </Link>
          <div className="flex flex-wrap justify-end gap-1.5">
            {isCheckedIn ? <Chip tone="success" icon={<Check />}>Checked in</Chip> : <LiveCheckedInChip />}
            <Chip tone={status.tone} icon={confirmed ? <Check /> : undefined}>{status.label}</Chip>
          </div>
        </div>
        {confirmed ? (
          <div className="flex items-center gap-4">
            <MoodTile mood="cheering" size={64} />
            <p className="text-display-m break-words text-ink">You&apos;re in, {name}!</p>
          </div>
        ) : rsvp.status === "WAITLISTED" || rsvp.status === "PENDING_APPROVAL" ? (
          <div className="flex items-center gap-4">
            <MoodTile mood="waiting" size={64} />
            <p className="text-display-m break-words text-ink">
              {rsvp.status === "WAITLISTED" ? `You're on the waitlist, ${name}.` : `Request sent, ${name}.`}
            </p>
          </div>
        ) : null}

        {confirmed ? (
          // Once checked in, the QR is never rendered again: the card shows its torn, checked-in state.
          <LiveTicketCard main={ticketMain} stub={isCheckedIn ? null : <TicketQrPanel token={rsvp.checkInToken} />} timeZone={timeZone} />
        ) : (
          <article className="overflow-hidden rounded-xl border border-line bg-panel">
            {ticketMain}
            <div className="px-6 pb-6">
              <Callout tone={rsvp.status === "REJECTED" ? "danger" : "info"}>
                {rsvp.status === "REJECTED"
                  ? "This registration wasn't approved, so there is no ticket."
                  : "A scannable ticket will be available after this registration is confirmed."}
              </Callout>
            </div>
          </article>
        )}

        {confirmed ? (
          <div className="grid grid-cols-2 gap-3">
            <Button asChild variant="primary" size="lg" fullWidth>
              <a href={googleCalendarEventUrl(calendarEvent)} target="_blank" rel="noreferrer" aria-label={`Add ${title} to Google Calendar`}>
                <CalendarPlus aria-hidden className="size-[18px] shrink-0" />
                Add to calendar
              </a>
            </Button>
            <TicketDownloadButton downloadUrl={`/api/ticket/${rsvp.checkInToken}/download`} />
          </div>
        ) : null}

        {!isCheckedIn && rsvp.status !== "REJECTED" ? (
          <HideAfterLiveCheckIn>
            <CancelRsvpButton checkInToken={rsvp.checkInToken} eventPageHref={eventPageHref} />
          </HideAfterLiveCheckIn>
        ) : null}
      </div>
    </LiveTicketProvider>
  );
}
