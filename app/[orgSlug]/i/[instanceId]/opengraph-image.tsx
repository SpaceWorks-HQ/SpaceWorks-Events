import { prisma } from "@/lib/db";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { shareCardResponse } from "@/lib/og/shareCard";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Space Works Events event preview";

export default async function OpenGraphImage({ params }: { params: Promise<{ orgSlug: string; instanceId: string }> }) {
  const { orgSlug, instanceId } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true } });
  const instance = org ? await prisma.eventInstance.findFirst({ where: { id: instanceId, series: { organisationId: org.id } }, include: { series: true } }) : null;
  const visible = instance && instance.series.status === EventStatus.PUBLISHED && instance.series.privacyType !== EventPrivacyType.INVITE_ONLY;
  const title = visible ? instance.series.title : "Space Works Events";
  const detail = visible ? `${org!.name} · ${instance.startDateTime.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: instance.series.timezone })}` : "Events made simple";
  return shareCardResponse({ title, detail, showRegister: Boolean(visible) });
}
