import { prisma } from "@/lib/db";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { shareCardResponse } from "@/lib/og/shareCard";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Space Works Events event preview";

export default async function OpenGraphImage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true } });
  const event = org ? await prisma.event.findUnique({ where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } }, include: { page: { select: { isPublished: true, accentColor: true } } } }) : null;
  const visible = event && event.status === EventStatus.PUBLISHED && event.page?.isPublished === true && event.privacyType !== EventPrivacyType.INVITE_ONLY;
  const title = visible ? event.title : "Space Works Events";
  const detail = visible ? `${org!.name} · ${event.startDateTime.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: event.timezone })}` : "Events made simple";
  return shareCardResponse({ title, detail, showRegister: Boolean(visible), accentColor: visible ? event.page?.accentColor : null });
}
