import "server-only";

import { PaymentRefundStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { loadPaymentAccount } from "../settings";
import { lockOrderTargets, orderSubject } from "../targets";

/** An organiser operation was refused; the message is safe to show. */
export class PaymentOperationError extends Error {}

export const ZERO = BigInt(0);
export const COLLECTED: PaymentStatus[] = [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_OFFLINE];
export const COMMITTED_REFUND: PaymentRefundStatus[] = [PaymentRefundStatus.PENDING, PaymentRefundStatus.SUCCEEDED];

/** Lock order everywhere: the event row (or the series, then its dates), then the order. */
export async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  const row = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, eventId: true, eventSeriesId: true } });
  if (row) await lockOrderTargets(tx, row);
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
}

export const subjectTitle = (order: Parameters<typeof orderSubject>[0]) => orderSubject(order)?.title ?? "your event";

export async function onlineAccount(organisationId: string) {
  if (!(await isPaidEventsEnabled())) throw new PaymentOperationError("Paid events are turned off for this installation.");
  const account = await loadPaymentAccount(organisationId);
  if (!account) throw new PaymentOperationError("Connect a payment account in the organisation's payment settings first.");
  return account;
}

export function attendeeEmail(rsvp: { guestEmail: string | null; user: { email: string | null; } | null; }) {
  return rsvp.user?.email?.trim() || rsvp.guestEmail;
}
