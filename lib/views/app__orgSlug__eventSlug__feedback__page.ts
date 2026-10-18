import { eventForView } from "@/lib/frontend/eventView";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
type Props = { params: Promise<{ orgSlug: string; eventSlug: string; }>; };
export async function loadRouteMetadata(): Promise<Metadata> { return { title: "Event feedback", robots: { index: false, follow: false } }; }
export async function loadFeedbackView({ params }: Props) {
  const { orgSlug, eventSlug } = await params;
  const event = await prisma.event.findFirst({ where: { organisation: { slug: orgSlug }, slug: eventSlug, status: EventStatus.PUBLISHED }, include: { page: { select: { accentColor: true } }, feedbackForm: { include: { fields: { orderBy: { sortOrder: "asc" } } } } } });
  if (!event?.feedbackForm?.isOpen) notFound();
  const fields = event.feedbackForm.fields.map((field) => ({ id: field.id, key: field.key, label: field.label, type: field.type, required: field.required, sortOrder: field.sortOrder, options: Array.isArray(field.options) ? field.options.filter((value): value is string => typeof value === "string") : [] }));
  return { event: { ...eventForView(event), feedbackForm: event.feedbackForm }, orgSlug, eventSlug, fields };
}
