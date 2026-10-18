import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PublicFeedbackForm } from "@/components/feedback/PublicFeedbackForm";
import { accentStyle } from "@/lib/theme/accent";
import { formatDayShort } from "@/lib/format/datetime";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { return { title: "Event feedback", robots: { index: false, follow: false } }; }
export default async function FeedbackPage({ params }: Props) {
  const { orgSlug, eventSlug } = await params;
  const event = await prisma.event.findFirst({ where: { organisation: { slug: orgSlug }, slug: eventSlug, status: EventStatus.PUBLISHED }, include: { page: { select: { accentColor: true } }, feedbackForm: { include: { fields: { orderBy: { sortOrder: "asc" } } } } } });
  if (!event?.feedbackForm?.isOpen) notFound();
  const fields = event.feedbackForm.fields.map((field) => ({ id: field.id, key: field.key, label: field.label, type: field.type, required: field.required, sortOrder: field.sortOrder, options: Array.isArray(field.options) ? field.options.filter((value): value is string => typeof value === "string") : [] }));
  return (
    <div style={accentStyle(event.page?.accentColor)} className="yy-accent-scope mx-auto flex w-full max-w-[592px] flex-col gap-6 py-2 sm:py-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-bold text-accent-text">{event.title} · {formatDayShort(event.startDateTime, event.timezone)}</p>
        <h1 className="text-display-m break-words text-ink">{event.feedbackForm.title}</h1>
      </header>
      <div className="rounded-xl border border-line bg-canvas p-5 shadow-raised sm:p-7">
        <PublicFeedbackForm orgSlug={orgSlug} eventSlug={eventSlug} fields={fields} thankYouMessage={event.feedbackForm.thankYouMessage} certificateEnabled={event.feedbackForm.certificateEnabled} />
      </div>
    </div>
  );
}
