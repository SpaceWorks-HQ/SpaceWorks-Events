import { type EventHeaderStat } from "@/components/dashboard/EventManageHeader";
import { loadEventDashboard } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
type Props = {
  params: Promise<{ orgSlug: string; eventId: string; }>;
};

export async function loadEventManageView({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const ctx = await loadEventDashboard(orgSlug, eventId);
  const { organisation, event, permissions } = ctx;
  const counts = permissions.canManageRegistrations ? await loadRsvpStatusCounts(event.id) : null;
  const stats: EventHeaderStat[] | undefined = counts
    ? [
      { label: "Going", value: event.capacity ? `${counts.confirmed} / ${event.capacity}` : counts.confirmed, meter: event.capacity ? { filled: counts.confirmed, total: event.capacity, tone: "accent" } : undefined },
      { label: "Waitlist", value: counts.waitlisted },
      { label: "To approve", value: counts.pendingApproval },
      { label: "Checked in", value: counts.checkedIn, meter: counts.confirmed ? { filled: counts.checkedIn, total: counts.confirmed, tone: "success" } : undefined },
    ]
    : undefined;
  const publicPath = `/${organisation.slug}/${event.slug}`;
  return { organisation, event, stats, permissions, ctx, publicPath, counts };
}
