import { loadInstanceScheduleView } from "@/lib/views/app__orgSlug__i__instanceId__schedule__page";
import { LiveSchedule } from "@/components/schedule/LiveSchedule";
import { accentStyle, INK_ACCENT } from "@/lib/theme/accent";
import { Breadcrumb } from "@/components/event/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event schedule" };

export default async function InstanceSchedulePage({ params }: { params: Promise<{ orgSlug: string; instanceId: string; }>; }) {
  const { org, instance, items } = await loadInstanceScheduleView({ params });
  return (
    <div style={accentStyle(INK_ACCENT)} className="yy-accent-scope mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <Breadcrumb items={[{ label: org.name, href: `/${org.slug}` }, { label: instance.series.title, href: `/${org.slug}/i/${instance.id}` }, { label: "Running order" }]} />
      <h1 className="text-display-m break-words text-ink">{instance.series.title} schedule</h1>
      {items.length > 0 ? <LiveSchedule items={items} timeZone={instance.series.timezone} /> : null}
    </div>
  );
}
