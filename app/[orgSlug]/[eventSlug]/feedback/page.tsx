import { loadRouteMetadata } from "@/lib/views/app__orgSlug__eventSlug__feedback__page";
import { loadFeedbackView } from "@/lib/views/app__orgSlug__eventSlug__feedback__page";
import type { Metadata } from "next";
import { PublicFeedbackForm } from "@/components/feedback/PublicFeedbackForm";
import { accentStyle } from "@/lib/theme/accent";
import { formatDayShort } from "@/lib/format/datetime";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string; }>; };
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { return loadRouteMetadata(); }
export default async function FeedbackPage({ params }: Props) {
  const { event, orgSlug, eventSlug, fields } = await loadFeedbackView({ params });
  return (
    <div style={accentStyle(event.page?.accentColor)} className="yy-accent-scope mx-auto flex w-full max-w-[592px] flex-col gap-6 py-2 sm:py-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-bold text-accent-text">{event.title} · {formatDayShort(event.startDateTime, event.timezone)}</p>
        <h1 className="text-display-m break-words text-ink">{event.feedbackForm.title}</h1>
      </header>
      <div className="rounded-xl border border-line bg-panel p-5 sm:p-7">
        <PublicFeedbackForm orgSlug={orgSlug} eventSlug={eventSlug} fields={fields} thankYouMessage={event.feedbackForm.thankYouMessage} certificateEnabled={event.feedbackForm.certificateEnabled} />
      </div>
    </div>
  );
}
