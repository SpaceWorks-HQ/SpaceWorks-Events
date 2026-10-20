import "server-only";

import crypto from "crypto";
import { EventPrivacyType, OfflinePaymentMethod, OrderStatus, PaymentStatus, RsvpStatus, type Prisma } from "@prisma/client";
import { enqueueRsvpConfirmation } from "@/lib/outbox";
import { enqueueOrderEmail, enqueuePaymentEmail } from "./email";
import { CHECKOUT_HOLD_MS, HOLD_EXTENSION_CAP_MS, PAYMENT_LINK_HOLD_MS, seatTakingWhere } from "./holds";
import type { OnlineProvider } from "./http";
import { DEFAULT_CURRENCY, formatMoney, providerMinimumMinor } from "./money";
import { priceOrder, PricingError, type OrderItem } from "./pricing";
import { lockPromoCode, PromoCodeError } from "./promo";
import { lockSellable, passesTaken, type OrderTarget, type Slot } from "./targets";
import { ticketSalesState } from "./tickets";

/** A rule refused the order; the message is safe to show the buyer. */
export class OrderError extends Error {}

/** Who collects a paid order, resolved before the reservation transaction. */
export type PaymentContext = { organisationId: string; provider: OnlineProvider | "OFFLINE"; testMode: boolean; };

/** An organiser adding a paid guest: email a payment link, record money taken, or make it complimentary. */
export type ManualPayment = { mode: "link" | "offline" | "waive"; method?: OfflinePaymentMethod; reference?: string | null; actorUserId: string; };


export type OrderAttendee = { name?: string | null; email?: string | null; };

const ZERO = BigInt(0);
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short order number for receipts, e.g. "K7QM-3XRA". */
export function newOrderReference() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** A free single registration on a full event joins the waitlist, as before tickets existed. */
function freeStatus(params: { left: number | null; seats: number; privacyType: EventPrivacyType; }) {
  if (params.privacyType === EventPrivacyType.APPROVAL_REQUIRED) return RsvpStatus.PENDING_APPROVAL;
  const fits = params.left == null || params.seats <= params.left;
  if (fits) return RsvpStatus.CONFIRMED;
  if (params.seats === 1) return RsvpStatus.WAITLISTED;
  throw new OrderError("There aren't enough places left for that many tickets.");
}

/**
 * Reserve an order under its locks (see lockSellable): price its lines (with
 * any promo code), check every ticket type's sales window and limit and each
 * event's or date's capacity (confirmed tickets plus live holds), then create
 * one registration per seat; a pass seats each person on every remaining
 * date. A paid order holds its seats for 30 minutes with one pending payment;
 * a free one is confirmed at once. A paid order that needs approval or
 * doesn't fit becomes a request: nothing is held or charged until the
 * organiser approves it or a place frees up (passes need a place on every
 * date, so they never wait). An organiser adding a guest can instead record
 * the payment, waive it, or send a day-long payment link. The caller is
 * inside a transaction.
 */
export async function reserveOrder(tx: Prisma.TransactionClient, params: {
  target: OrderTarget;
  items: OrderItem[];
  buyer: { userId: string | null; email: string; name: string; attendeeKey: string; };
  /** Details for the second and later tickets, in order; any may be missing. */
  attendees: OrderAttendee[];
  enforceOpen: boolean;
  payment?: PaymentContext;
  promoCode?: string;
  /** Set when an organiser adds the guest by hand. */
  manual?: ManualPayment;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const sellable = await lockSellable(tx, params.target, now);
  const isPass = "passSeriesId" in params.target;
  if (!sellable || (params.enforceOpen && !sellable.open)) {
    throw new OrderError(isPass ? "There are no dates left to buy a pass for." : "This event is not open for registration.");
  }

  const types = await tx.ticketType.findMany({
    where: { ...sellable.owner, kind: sellable.typeKind, archivedAt: null },
    select: { id: true, name: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true },
  });
  let priced;
  let promoCodeId: string | null = null;
  try {
    const promo = params.promoCode ? await lockPromoCode(tx, { owner: sellable.owner, code: params.promoCode, now }) : null;
    promoCodeId = promo?.id ?? null;
    priced = priceOrder(params.items, types, promo?.rule);
  } catch (error) {
    if (error instanceof PricingError || error instanceof PromoCodeError) throw new OrderError(error.message);
    throw error;
  }
  for (const line of priced.lines) {
    const type = types.find((candidate) => candidate.id === line.ticketTypeId)!;
    const sales = ticketSalesState(type, now);
    if (params.enforceOpen && sales === "not_started") throw new OrderError(`Sales for ${type.name} haven't started yet.`);
    if (params.enforceOpen && sales === "ended") throw new OrderError(`Sales for ${type.name} have ended.`);
  }

  // The people, in line order; the buyer is the first.
  const seatTypes = priced.lines.flatMap((line) => Array<string>(line.quantity).fill(line.ticketTypeId));
  const attendees = seatTypes.slice(1).map((_, index) => params.attendees[index] ?? {});
  const emails = [params.buyer.email, ...attendees.map((attendee) => attendee.email?.trim().toLowerCase()).filter(Boolean)];
  if (new Set(emails).size !== emails.length) throw new OrderError("Each ticket needs a different email address, or leave extra ones blank.");

  // An unpaid hold that has ended no longer blocks these people from registering again.
  const keys = [params.buyer.attendeeKey, ...attendees.flatMap((attendee) => (attendee.email ? [`guest:${attendee.email.trim().toLowerCase()}`] : []))];
  await tx.rSVP.deleteMany({
    where: { OR: sellable.slots.map((slot) => slot.target), attendeeKey: { in: keys }, status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt: { lte: now }, order: { status: { in: [OrderStatus.EXPIRED, OrderStatus.CANCELLED] } } },
  });

  // Places left on the event, or on each date (the fullest one decides).
  let left: number | null = null;
  let fullest: Slot | null = null;
  for (const slot of sellable.slots) {
    if (slot.capacity == null) continue;
    const slotLeft = slot.capacity - await tx.rSVP.count({ where: { ...slot.target, ...seatTakingWhere(now) } });
    if (left == null || slotLeft < left) {
      left = slotLeft;
      fullest = slot;
    }
  }
  const totalMinor = priced.totalMinor;
  let typesFit = true;
  for (const line of priced.lines) {
    const type = types.find((candidate) => candidate.id === line.ticketTypeId)!;
    if (type.capacity == null) continue;
    const typeTaken = isPass
      ? await passesTaken(tx, type.id, now)
      : await tx.rSVP.count({ where: { ticketTypeId: type.id, ...sellable.slots[0]!.target, ...seatTakingWhere(now) } });
    if (typeTaken + line.quantity > type.capacity) {
      // A paid order for a sold-out ticket waits for a place instead.
      if (!isPass && totalMinor > ZERO && typeTaken >= type.capacity) {
        typesFit = false;
        continue;
      }
      throw new OrderError(type.capacity - typeTaken <= 0 ? `${type.name} is sold out.` : `Only ${type.capacity - typeTaken} ${type.name} left.`);
    }
  }
  // A pass needs a place on every date it covers.
  if (isPass && left != null && priced.seats > left) {
    throw new OrderError(left <= 0 ? `${fullest!.label} is full, so passes can't be sold.` : `Only ${left} ${left === 1 ? "pass" : "passes"} left: ${fullest!.label} is nearly full.`);
  }

  const paid = totalMinor > ZERO;
  const currency = sellable.currency ?? DEFAULT_CURRENCY;
  const manual = params.manual;
  const settledByHand = paid && manual && manual.mode !== "link";
  let status: RsvpStatus;
  let orderStatus: OrderStatus;
  if (paid) {
    if (!params.payment) throw new OrderError("Tickets can't be bought right now. Try again later.");
    if (manual?.mode === "link" && params.payment.provider === "OFFLINE") throw new OrderError("Connect a payment account to send payment links.");
    // Some places left but not enough: choose fewer. None left: the waitlist.
    if (left != null && left > 0 && priced.seats > left) throw new OrderError(`Only ${left} ${left === 1 ? "place" : "places"} left.`);
    const fits = typesFit && (left == null || left > 0);
    if (params.payment.provider !== "OFFLINE" && !settledByHand) {
      const minimum = providerMinimumMinor(params.payment.provider, currency);
      if (totalMinor < minimum) throw new OrderError(`The total is below the smallest payment the provider accepts (${formatMoney(minimum, currency)}).`);
    }
    if (sellable.privacyType === EventPrivacyType.APPROVAL_REQUIRED && !manual) {
      // Sign up first; pay after approval, through a payment link.
      status = RsvpStatus.PENDING_APPROVAL;
      orderStatus = OrderStatus.REQUESTED;
    } else if (!fits) {
      // Money taken by hand needs a place now; it can't wait on the list.
      if (settledByHand) throw new OrderError("There's no free place for this guest. Free one first, or send them a payment link to join the waitlist.");
      // The waitlist: pay only if a place is offered.
      status = RsvpStatus.WAITLISTED;
      orderStatus = OrderStatus.REQUESTED;
    } else if (settledByHand) {
      status = RsvpStatus.CONFIRMED;
      orderStatus = OrderStatus.CONFIRMED;
    } else {
      status = RsvpStatus.PENDING_PAYMENT;
      orderStatus = OrderStatus.PENDING;
    }
  } else {
    status = freeStatus({ left, seats: priced.seats, privacyType: sellable.privacyType });
    if (isPass && status === RsvpStatus.WAITLISTED) throw new OrderError(`${fullest!.label} is full, so passes can't be given out.`);
    orderStatus = OrderStatus.CONFIRMED;
  }

  // Organiser-sent links give the guest a day to pay; the checkout opens only when they click Pay.
  const holdMs = manual ? PAYMENT_LINK_HOLD_MS : CHECKOUT_HOLD_MS;
  const holdExpiresAt = orderStatus === OrderStatus.PENDING ? new Date(now.getTime() + holdMs) : null;
  const order = await tx.order.create({
    data: {
      organisationId: sellable.organisationId,
      ...sellable.orderColumns,
      reference: newOrderReference(),
      buyerUserId: params.buyer.userId,
      buyerEmail: params.buyer.email,
      buyerName: params.buyer.name,
      status: orderStatus,
      currency,
      subtotalMinor: priced.subtotalMinor,
      discountMinor: priced.discountMinor,
      totalMinor,
      testMode: params.payment?.testMode ?? false,
      holdExpiresAt,
      holdCapAt: holdExpiresAt ? new Date(holdExpiresAt.getTime() + HOLD_EXTENSION_CAP_MS) : null,
      promoCodeId,
      refundPolicy: paid ? sellable.refundPolicy : undefined,
      lines: { create: priced.lines.map((line) => ({ kind: line.kind, ticketTypeId: line.ticketTypeId, description: line.description, quantity: line.quantity, unitMinor: line.unitMinor, discountMinor: line.discountMinor, totalMinor: line.totalMinor })) },
    },
    select: { id: true, reference: true, accessToken: true },
  });

  // One registration per person per date; a person keeps one key across a pass's dates.
  const rsvps: Array<{ id: string; checkInToken: string; email: string | null; first: boolean; }> = [];
  for (const [index, ticketTypeId] of seatTypes.entries()) {
    const attendee = index === 0 ? null : attendees[index - 1]!;
    const email = index === 0 ? params.buyer.email : attendee?.email?.trim().toLowerCase() || null;
    for (const [slotIndex, slot] of sellable.slots.entries()) {
      const rsvp = await tx.rSVP.create({
        data: index === 0
          ? { ...slot.target, userId: params.buyer.userId, guestEmail: params.buyer.userId ? null : params.buyer.email, guestName: params.buyer.userId ? null : params.buyer.name, attendeeKey: params.buyer.attendeeKey, status, orderId: order.id, ticketTypeId, holdExpiresAt }
          : {
            ...slot.target,
            guestEmail: email,
            guestName: attendee?.name?.trim() || `${params.buyer.name} (ticket ${index + 1})`,
            // A placeholder key until the buyer adds this attendee's email.
            attendeeKey: email ? `guest:${email}` : `order:${order.id}:${index}`,
            status, orderId: order.id, ticketTypeId, holdExpiresAt,
          },
        select: { id: true, checkInToken: true },
      });
      rsvps.push({ ...rsvp, email, first: slotIndex === 0 });
    }
  }

  let paymentId: string | null = null;
  if (paid && params.payment && (orderStatus === OrderStatus.PENDING || orderStatus === OrderStatus.CONFIRMED)) {
    const description = isPass ? `${sellable.title} pass` : sellable.slots[0]!.label;
    paymentId = (await tx.payment.create({
      data: {
        organisationId: sellable.organisationId, orderId: order.id, amountMinor: totalMinor, currency, provider: params.payment.provider, testMode: params.payment.testMode, description: description.slice(0, 300),
        ...(manual?.mode === "offline"
          ? { status: PaymentStatus.PAID_OFFLINE, paidAt: now, offlineMethod: manual.method ?? OfflinePaymentMethod.OTHER, offlineReference: manual.reference?.trim().slice(0, 120) || null, settledByUserId: manual.actorUserId }
          : manual?.mode === "waive" ? { status: PaymentStatus.WAIVED, settledByUserId: manual.actorUserId } : {}),
      },
      select: { id: true },
    })).id;
    if (orderStatus === OrderStatus.PENDING) await enqueuePaymentEmail(tx, { to: params.buyer.email, paymentId, notice: "pending" });
    else if (manual?.mode === "offline") await enqueuePaymentEmail(tx, { to: params.buyer.email, paymentId, notice: "paid" });
  }
  if (orderStatus !== OrderStatus.PENDING) {
    // One email per person: a pass's ticket page lists its other dates.
    for (const rsvp of rsvps) {
      if (rsvp.email && rsvp.first) await enqueueRsvpConfirmation(tx, { to: rsvp.email, eventTitle: sellable.slots[0]!.label, status, checkInToken: rsvp.checkInToken });
    }
  }
  if (orderStatus === OrderStatus.CONFIRMED && rsvps.some((rsvp) => !rsvp.email)) await enqueueOrderEmail(tx, { to: params.buyer.email, orderId: order.id, notice: "attendee-details" });
  const count = await tx.rSVP.count({ where: sellable.slots[0]!.target });
  return { orderId: order.id, reference: order.reference, accessToken: order.accessToken, status, buyerRsvpId: rsvps[0]!.id, buyerTicketToken: rsvps[0]!.checkInToken, paymentId, count };
}
