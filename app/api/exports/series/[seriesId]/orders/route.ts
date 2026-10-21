import { EventPermission } from "@prisma/client";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { canAccessEvent } from "@/lib/eventAccess";
import { ordersCsvResponse, ordersCsvStream } from "@/lib/payments/ordersExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });

/** Every order with its money, for organisation admins and co-organisers who manage registrations. */
export async function GET(_request: Request, context: { params: Promise<{ seriesId: string; }>; }) {
  const session = await auth();
  if (!session?.user?.id) return missing();
  const { seriesId } = await context.params;
  const target = await prisma.eventSeries.findUnique({ where: { id: seriesId }, select: { id: true, title: true, organisationId: true, timezone: true } });
  if (!target) return missing();
  if (!(await canAccessEvent({ userId: session.user.id, organisationId: target.organisationId, eventSeriesId: target.id, permission: EventPermission.MANAGE_REGISTRATIONS }))) return missing();
  await recordAuditEvent({ action: "ORDERS_EXPORTED", actorUserId: session.user.id, organisationId: target.organisationId, targetType: "EventSeries", targetId: target.id });
  return ordersCsvResponse(ordersCsvStream({ eventSeriesId: target.id }, target.timezone), target.title);
}
