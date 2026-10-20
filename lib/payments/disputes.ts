import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOperatorNotice } from "@/lib/outbox";
import { organisationOwnerEmails } from "./email";
import type { OnlineProvider } from "./http";
import { formatMoney } from "./money";
import type { DisputeNotification } from "./providers/types";

const LABELS: Record<DisputeNotification["status"], string> = {
  OPEN: "opened", UNDER_REVIEW: "under review", WON: "won", LOST: "lost", CLOSED: "closed",
};

/**
 * Record a dispute (chargeback) from a verified webhook, matched to a
 * payment of this organisation and provider only. A new dispute, or a change
 * of status, emails the owners with what to do; nothing is cancelled
 * automatically: the organiser answers it in the provider's dashboard.
 */
export async function applyDisputeNotification(tx: Prisma.TransactionClient, context: { organisationId: string; provider: OnlineProvider; }, dispute: DisputeNotification) {
  const payment = await tx.payment.findFirst({
    where: { organisationId: context.organisationId, provider: context.provider, externalPaymentId: dispute.paymentId },
    select: { id: true, amountMinor: true, currency: true, order: { select: { reference: true, buyerEmail: true } } },
  });
  if (!payment) return;
  const existing = await tx.paymentDispute.findUnique({ where: { provider_externalDisputeId: { provider: context.provider, externalDisputeId: dispute.disputeId } }, select: { id: true, status: true, paymentId: true } });
  if (existing && existing.paymentId !== payment.id) return;
  const values = {
    status: dispute.status,
    amountMinor: dispute.amountMinor ?? payment.amountMinor,
    currency: dispute.currency ?? payment.currency,
    reason: (dispute.reason ?? "").slice(0, 200),
    respondBy: dispute.respondBy,
  };
  const saved = existing
    ? await tx.paymentDispute.update({ where: { id: existing.id }, data: values, select: { id: true } })
    : await tx.paymentDispute.create({ data: { ...values, organisationId: context.organisationId, paymentId: payment.id, provider: context.provider, externalDisputeId: dispute.disputeId }, select: { id: true } });
  if (existing?.status === dispute.status) return;

  await recordAuditEvent({ action: "PAYMENT_DISPUTE_UPDATED", organisationId: context.organisationId, targetType: "PaymentDispute", targetId: saved.id, metadata: { status: dispute.status }, client: tx });
  const provider = context.provider === "RAZORPAY" ? "Razorpay" : "Stripe";
  const amount = formatMoney(values.amountMinor, values.currency);
  for (const to of await organisationOwnerEmails(tx, context.organisationId)) {
    await enqueueOperatorNotice(tx, {
      to,
      subject: `Payment dispute ${LABELS[dispute.status]}: order ${payment.order.reference}`,
      lines: [
        `A dispute (chargeback) for ${amount} on order ${payment.order.reference} (${payment.order.buyerEmail}) was ${LABELS[dispute.status]} in ${provider}${values.reason ? `, reason: ${values.reason}` : ""}.`,
        dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW"
          ? `Answer it in your ${provider} dashboard${values.respondBy ? ` by ${values.respondBy.toUTCString()}` : ""}, with proof of the booking and attendance. The tickets stay as they are.`
          : "Nothing else is needed. The tickets stay as they are; refund or cancel them from the guest list if that's right.",
      ],
    });
  }
}
