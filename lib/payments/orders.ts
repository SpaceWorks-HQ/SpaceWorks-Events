import "server-only";

import crypto from "crypto";
import { EventPrivacyType, EventStatus, OfflinePaymentMethod, OrderStatus, PaymentStatus, RsvpStatus, type Prisma } from "@prisma/client";
import { enqueueRsvpConfirmation } from "@/lib/outbox";
import { isRegistrationClosed } from "@/lib/registrationCutoff";
import { enqueueOrderEmail, enqueuePaymentEmail } from "./email";
import { CHECKOUT_HOLD_MS, HOLD_EXTENSION_CAP_MS, PAYMENT_LINK_HOLD_MS, seatTakingWhere } from "./holds";
import type { OnlineProvider } from "./http";
import { DEFAULT_CURRENCY, formatMoney, providerMinimumMinor } from "./money";
import { priceOrder, PricingError, type OrderItem } from "./pricing";
import { lockPromoCode, PromoCodeError } from "./promo";
import type { RefundPolicySnapshot } from "./refundPolicy";
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
function freeStatus(params: { capacity: number | null; taken: number; seats: number; privacyType: EventPrivacyType; }) {
  if (params.privacyType === EventPrivacyType.APPROVAL_REQUIRED) return RsvpStatus.PENDING_APPROVAL;
  const fits = params.capacity == null || params.taken + params.seats <= params.capacity;
  if (fits) return RsvpStatus.CONFIRMED;
  if (params.seats === 1) return RsvpStatus.WAITLISTED;
  throw new OrderError("There aren't enough places left for that many tickets.");
}

/**
 * Reserve an order under the event row lock: price its lines (with any promo
 * code), check every ticket type's sales window and limit and the event
 * capacity (confirmed tickets plus live holds), then create one registration
 * per seat. A paid order holds its seats for 30 minutes with one pending
 * payment; a free one is confirmed at once. A paid order that needs approval
 * or doesn't fit becomes a request: nothing is held or charged until the
 * organiser approves it or a place frees up. An organiser adding a guest can
 * instead record the payment, waive it, or send a day-long payment link.
 * The caller is inside a transaction.
 */
export async function reserveOrder(tx: Prisma.TransactionClient, params: {
  eventId: string;
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
  await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${params.eventId} FOR UPDATE`;
  const event = await tx.event.findUnique({
    where: { id: params.eventId },
    select: {
      id: true, organisationId: true, title: true, capacity: true, privacyType: true, status: true, currency: true,
      startDateTime: true, endDateTime: true, registrationClosesAt: true, registrationLeadMinutes: true, page: { select: { isPublished: true } },
      refundPolicyKind: true, refundPolicyHours: true, refundPolicyPercent: true, refundPolicyText: true,
    },
  });
  if (!event) throw new OrderError("This event is not open for registration.");
  if (params.enforceOpen && (event.status !== EventStatus.PUBLISHED || event.page?.isPublished !== true || event.endDateTime <= now || isRegistrationClosed(event))) {
    throw new OrderError("This event is not open for registration.");
  }

  const types = await tx.ticketType.findMany({
    where: { eventId: event.id, archivedAt: null },
    select: { id: true, name: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true },
  });
  let priced;
  let promoCodeId: string | null = null;
  try {
    const promo = params.promoCode ? await lockPromoCode(tx, { eventId: event.id, code: params.promoCode, now }) : null;
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

  // The seats, in line order; the buyer takes the first one.
  const seatTypes = priced.lines.flatMap((line) => Array<string>(line.quantity).fill(line.ticketTypeId));
  const attendees = seatTypes.slice(1).map((_, index) => params.attendees[index] ?? {});
  const emails = [params.buyer.email, ...attendees.map((attendee) => attendee.email?.trim().toLowerCase()).filter(Boolean)];
  if (new Set(emails).size !== emails.length) throw new OrderError("Each ticket needs a different email address, or leave extra ones blank.");

  // An unpaid hold that has ended no longer blocks these people from registering again.
  const keys = [params.buyer.attendeeKey, ...attendees.flatMap((attendee) => (attendee.email ? [`guest:${attendee.email.trim().toLowerCase()}`] : []))];
  await tx.rSVP.deleteMany({
    where: { eventId: event.id, attendeeKey: { in: keys }, status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt: { lte: now }, order: { status: { in: [OrderStatus.EXPIRED, OrderStatus.CANCELLED] } } },
  });

  const taken = await tx.rSVP.count({ where: { eventId: event.id, ...seatTakingWhere(now) } });
  let typesFit = true;
  for (const line of priced.lines) {
    const type = types.find((candidate) => candidate.id === line.ticketTypeId)!;
    if (type.capacity == null) continue;
    const typeTaken = await tx.rSVP.count({ where: { ticketTypeId: type.id, ...seatTakingWhere(now) } });
    if (typeTaken + line.quantity > type.capacity) {
      // A paid order for a sold-out ticket waits for a place instead.
      if (priced.totalMinor > ZERO && typeTaken >= type.capacity) {
        typesFit = false;
        continue;
      }
      throw new OrderError(type.capacity - typeTaken <= 0 ? `${type.name} is sold out.` : `Only ${type.capacity - typeTaken} ${type.name} left.`);
    }
  }

  const paid = priced.totalMinor > ZERO;
  const currency = event.currency ?? DEFAULT_CURRENCY;
  const manual = params.manual;
  const settledByHand = paid && manual && manual.mode !== "link";
  let status: RsvpStatus;
  let orderStatus: OrderStatus;
  if (paid) {
    if (!params.payment) throw new OrderError("Tickets can't be bought right now. Try again later.");
    if (manual?.mode === "link" && params.payment.provider === "OFFLINE") throw new OrderError("Connect a payment account to send payment links.");
    const left = event.capacity == null ? null : event.capacity - taken;
    // Some places left but not enough: choose fewer. None left: the waitlist.
    if (left != null && left > 0 && priced.seats > left) throw new OrderError(`Only ${left} ${left === 1 ? "place" : "places"} left.`);
    const fits = typesFit && (left == null || left > 0);
    if (params.payment.provider !== "OFFLINE" && !settledByHand) {
      const minimum = providerMinimumMinor(params.payment.provider, currency);
      if (priced.totalMinor < minimum) throw new OrderError(`The total is below the smallest payment the provider accepts (${formatMoney(minimum, currency)}).`);
    }
    if (event.privacyType === EventPrivacyType.APPROVAL_REQUIRED && !manual) {
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
    status = freeStatus({ capacity: event.capacity, taken, seats: priced.seats, privacyType: event.privacyType });
    orderStatus = OrderStatus.CONFIRMED;
  }

  // Organiser-sent links give the guest a day to pay; the checkout opens only when they click Pay.
  const holdMs = manual ? PAYMENT_LINK_HOLD_MS : CHECKOUT_HOLD_MS;
  const holdExpiresAt = orderStatus === OrderStatus.PENDING ? new Date(now.getTime() + holdMs) : null;
  const refundPolicy: RefundPolicySnapshot = { kind: event.refundPolicyKind, hours: event.refundPolicyHours, percent: event.refundPolicyPercent, text: event.refundPolicyText };
  const order = await tx.order.create({
    data: {
      organisationId: event.organisationId,
      eventId: event.id,
      reference: newOrderReference(),
      buyerUserId: params.buyer.userId,
      buyerEmail: params.buyer.email,
      buyerName: params.buyer.name,
      status: orderStatus,
      currency,
      subtotalMinor: priced.subtotalMinor,
      discountMinor: priced.discountMinor,
      totalMinor: priced.totalMinor,
      testMode: params.payment?.testMode ?? false,
      holdExpiresAt,
      holdCapAt: holdExpiresAt ? new Date(holdExpiresAt.getTime() + HOLD_EXTENSION_CAP_MS) : null,
      promoCodeId,
      refundPolicy: paid ? refundPolicy : undefined,
      lines: { create: priced.lines.map((line) => ({ kind: line.kind, ticketTypeId: line.ticketTypeId, description: line.description, quantity: line.quantity, unitMinor: line.unitMinor, discountMinor: line.discountMinor, totalMinor: line.totalMinor })) },
    },
    select: { id: true, reference: true, accessToken: true },
  });

  const rsvps: Array<{ id: string; checkInToken: string; email: string | null; }> = [];
  for (const [index, ticketTypeId] of seatTypes.entries()) {
    const attendee = index === 0 ? null : attendees[index - 1]!;
    const email = index === 0 ? params.buyer.email : attendee?.email?.trim().toLowerCase() || null;
    const rsvp = await tx.rSVP.create({
      data: index === 0
        ? { eventId: event.id, userId: params.buyer.userId, guestEmail: params.buyer.userId ? null : params.buyer.email, guestName: params.buyer.userId ? null : params.buyer.name, attendeeKey: params.buyer.attendeeKey, status, orderId: order.id, ticketTypeId, holdExpiresAt }
        : {
          eventId: event.id,
          guestEmail: email,
          guestName: attendee?.name?.trim() || `${params.buyer.name} (ticket ${index + 1})`,
          // A placeholder key until the buyer adds this attendee's email.
          attendeeKey: email ? `guest:${email}` : `order:${order.id}:${index}`,
          status, orderId: order.id, ticketTypeId, holdExpiresAt,
        },
      select: { id: true, checkInToken: true },
    });
    rsvps.push({ ...rsvp, email });
  }

  let paymentId: string | null = null;
  if (paid && params.payment && (orderStatus === OrderStatus.PENDING || orderStatus === OrderStatus.CONFIRMED)) {
    paymentId = (await tx.payment.create({
      data: {
        organisationId: event.organisationId, orderId: order.id, amountMinor: priced.totalMinor, currency, provider: params.payment.provider, testMode: params.payment.testMode, description: event.title.slice(0, 300),
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
    for (const rsvp of rsvps) {
      if (rsvp.email) await enqueueRsvpConfirmation(tx, { to: rsvp.email, eventTitle: event.title, status, checkInToken: rsvp.checkInToken });
    }
  }
  if (orderStatus === OrderStatus.CONFIRMED && rsvps.some((rsvp) => !rsvp.email)) await enqueueOrderEmail(tx, { to: params.buyer.email, orderId: order.id, notice: "attendee-details" });
  const count = await tx.rSVP.count({ where: { eventId: event.id } });
  return { orderId: order.id, reference: order.reference, accessToken: order.accessToken, status, buyerRsvpId: rsvps[0]!.id, buyerTicketToken: rsvps[0]!.checkInToken, paymentId, count };
}
