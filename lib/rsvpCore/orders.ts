import { RsvpStatus, TicketTypeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/app/actions/org";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { startCheckout } from "@/lib/payments/checkout";
import { OrderError, reserveOrder, type PaymentContext } from "@/lib/payments/orders";
import type { OrderTarget } from "@/lib/payments/targets";
import { loadPaymentAccount } from "@/lib/payments/settings";
import { requestedItems, type AnswerRow, type OrderRequest } from "./shared";

/**
 * Who collects the order if it costs money: the organisation's connected
 * account, while paid events are on for this installation. Whether it costs
 * anything is only known once priced (a chosen amount, a fee, an add-on), so
 * the account is resolved for any ticket order. Undefined otherwise; the
 * reservation then refuses a paid order and still takes a free one.
 */
export async function paymentContextFor(organisationId: string, items: Array<{ ticketTypeId: string; }>): Promise<PaymentContext | undefined> {
  if (items.length === 0 || !(await isPaidEventsEnabled())) return undefined;
  const account = await loadPaymentAccount(organisationId);
  return account ? { organisationId, provider: account.provider, testMode: account.testMode } : undefined;
}

/**
 * Registration for an event or series that sells ticket types: one order,
 * one registration per ticket (per date, for a pass), priced and seated
 * under the event's or series's locks. The buyer's answers go on their own
 * (first) ticket. A paid order then opens the provider's checkout, outside
 * the transaction.
 */
export async function submitTicketOrder(params: {
  target: OrderTarget;
  organisationId: string;
  request: OrderRequest;
  buyer: { userId: string | null; email: string; name: string; attendeeKey: string; };
  answers: AnswerRow[];
  setUserName?: string | null;
}): Promise<ActionResult<{ count: number; status: RsvpStatus; ticketToken: string; orderToken: string; checkoutUrl: string | null }>> {
  const items = requestedItems(params.request);
  if (items.length === 0) return { ok: false, error: "Choose a ticket." };
  try {
    // Paying at the desk needs no online account: it's recorded in person.
    const payment = params.request.payAtDesk
      ? (await isPaidEventsEnabled() ? { organisationId: params.organisationId, provider: "OFFLINE" as const, testMode: false } : undefined)
      : await paymentContextFor(params.organisationId, items);
    const order = await prisma.$transaction(async (tx) => {
      const reserved = await reserveOrder(tx, {
        target: params.target,
        items,
        buyer: params.buyer,
        attendees: params.request.attendees ?? [],
        enforceOpen: true,
        payment,
        promoCode: params.request.promoCode || undefined,
        accessCode: params.request.accessCode || undefined,
        addOns: params.request.addOns,
        payAtDesk: params.request.payAtDesk,
      });
      if (params.setUserName && params.buyer.userId) await tx.user.update({ where: { id: params.buyer.userId }, data: { name: params.setUserName } });
      if (params.answers.length > 0) {
        await tx.rsvpAnswer.createMany({
          data: params.answers.map((row) => ({ rsvpId: reserved.buyerRsvpId, fieldId: row.fieldId, valueText: row.valueText ?? null, valueBool: row.valueBool ?? null, valueNumber: row.valueNumber ?? null, valueDate: row.valueDate ?? null })),
        });
      }
      return reserved;
    });
    const checkout = order.paymentId ? await startCheckout(order.orderId).catch(() => null) : null;
    return {
      ok: true,
      data: {
        count: order.count,
        status: order.status,
        ticketToken: order.buyerTicketToken,
        orderToken: order.accessToken,
        checkoutUrl: checkout && "url" in checkout ? checkout.url : null,
      },
    };
  } catch (error: unknown) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      return { ok: false, error: "Someone on this order is already registered for this event." };
    }
    console.error("[rsvp] ticket order failed");
    return { ok: false, error: "Could not save your order." };
  }
}

/** Events and series with active ticket types register through orders. */
export async function sellsTickets(owner: { eventId: string; } | { eventSeriesId: string; }) {
  return (await prisma.ticketType.count({ where: { ...owner, archivedAt: null } })) > 0;
}

/**
 * A series order is for one date or for passes, never both: the chosen
 * ticket types decide which.
 */
export async function seriesOrderTarget(seriesId: string, eventInstanceId: string, items: Array<{ ticketTypeId: string; }>): Promise<OrderTarget | { error: string; }> {
  const passes = await prisma.ticketType.count({ where: { eventSeriesId: seriesId, id: { in: items.map((item) => item.ticketTypeId) }, kind: TicketTypeKind.PASS } });
  if (passes === 0) return { eventInstanceId };
  if (passes < new Set(items.map((item) => item.ticketTypeId)).size) return { error: "Buy passes and single dates in separate orders." };
  return { passSeriesId: seriesId };
}
