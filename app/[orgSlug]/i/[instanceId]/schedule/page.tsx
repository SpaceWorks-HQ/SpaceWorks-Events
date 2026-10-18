import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { effectiveSchedule } from "@/lib/schedule";
import { LiveSchedule } from "@/components/schedule/LiveSchedule";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { accentStyle, INK_ACCENT } from "@/lib/theme/accent";
import { Breadcrumb } from "@/components/event/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event schedule" };

export default async function InstanceSchedulePage({ params }: { params: Promise<{ orgSlug: string; instanceId: string }> }) {
  const { orgSlug, instanceId } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug } });
  if (!org) notFound();
  const instance = await prisma.eventInstance.findFirst({ where: { id: instanceId, series: { organisationId: org.id } }, include: { series: { include: { scheduleItems: { orderBy: { sortOrder: "asc" } } } } } });
  if (!instance) notFound();
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventSeriesId: instance.series.id, status: instance.series.status, privacyType: instance.series.privacyType });
  if (!access.allowed) notFound();
  const items = effectiveSchedule(instance.series.scheduleItems).map((i) => ({ ...i, effectiveStart: i.effectiveStart.toISOString(), effectiveEnd: i.effectiveEnd.toISOString() }));
  return (
    <div style={accentStyle(INK_ACCENT)} className="yy-accent-scope mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <Breadcrumb items={[{ label: org.name, href: `/${org.slug}` }, { label: instance.series.title, href: `/${org.slug}/i/${instance.id}` }, { label: "Running order" }]} />
      <h1 className="text-display-m break-words text-ink">{instance.series.title} schedule</h1>
      {items.length > 0 ? <LiveSchedule items={items} timeZone={instance.series.timezone} /> : null}
    </div>
  );
}
