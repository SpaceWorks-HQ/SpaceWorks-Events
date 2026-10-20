import "server-only";

import { OrderStatus, PaymentRefundStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EMAIL_BUTTON_STYLE, EMAIL_COLORS, emailLayout } from "@/lib/email/brand";
import { assertEmailAccepted, getEmailTransport } from "@/lib/email/transporter";
import { formatMoney } from "./money";
import { checkoutLineName } from "./pricing";

type OutboxClient = Prisma.TransactionClient | typeof prisma;

export const PAYMENT_EMAIL_KIND = "payment-notice";

/** Notices about one payment. */
export const PAYMENT_NOTICES = ["pending", "paid", "expired", "late-refund", "organiser-late-refund", "refunded"] as const;
/** Notices about an order as a whole. */
export const ORDER_NOTICES = ["attendee-details"] as const;
export type PaymentNotice = (typeof PAYMENT_NOTICES)[number];
export type OrderNotice = (typeof ORDER_NOTICES)[number];

/**
 * The queue stores only the recipient, an id and the notice. Links, names
 * and amounts are read when the email is sent, so no capability is queued.
 */
export type PaymentEmailPayload =
  | { to: string; paymentId: string; notice: PaymentNotice; }
  | { to: string; orderId: string; notice: OrderNotice; };

export async function enqueuePaymentEmail(client: OutboxClient, payload: { to: string; paymentId: string; notice: PaymentNotice; }) {
  return client.outboxMessage.create({ data: { kind: PAYMENT_EMAIL_KIND, payload: payload as Prisma.InputJsonValue } });
}

export async function enqueueOrderEmail(client: OutboxClient, payload: { to: string; orderId: string; notice: OrderNotice; }) {
  return client.outboxMessage.create({ data: { kind: PAYMENT_EMAIL_KIND, payload: payload as Prisma.InputJsonValue } });
}

/** The organisation's verified owners, who receive operational payment notices. */
export async function organisationOwnerEmails(client: OutboxClient, organisationId: string) {
  const owners = await client.membership.findMany({
    where: { organisationId, role: "OWNER", user: { email: { not: null }, emailVerified: { not: null } } },
    select: { user: { select: { email: true } } },
    take: 5,
  });
  return owners.map((owner) => owner.user.email!).filter(Boolean);
}

const ID = /^[a-z0-9]{20,40}$/;

export function asPaymentEmailPayload(value: Prisma.JsonValue): PaymentEmailPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.to !== "string" || payload.to.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to)) return null;
  if (typeof payload.paymentId === "string" && ID.test(payload.paymentId) && PAYMENT_NOTICES.includes(payload.notice as PaymentNotice)) {
    return { to: payload.to, paymentId: payload.paymentId, notice: payload.notice as PaymentNotice };
  }
  if (typeof payload.orderId === "string" && ID.test(payload.orderId) && ORDER_NOTICES.includes(payload.notice as OrderNotice)) {
    return { to: payload.to, orderId: payload.orderId, notice: payload.notice as OrderNotice };
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function oneLine(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 200);
}

const HEADING = `margin-top: 0; color: ${EMAIL_COLORS.ink}; font-size: 20px; font-weight: 600;`;
const BODY = `font-size: 16px; line-height: 1.5; color: ${EMAIL_COLORS.inkMuted};`;
const FACTS = `font-size: 15px; line-height: 1.6; color: ${EMAIL_COLORS.ink}; background-color: ${EMAIL_COLORS.cream}; border-radius: 10px; padding: 12px 16px;`;

const orderSelect = {
  id: true, reference: true, accessToken: true, status: true, currency: true, totalMinor: true, testMode: true, buyerName: true, holdExpiresAt: true,
  lines: { select: { description: true, quantity: true, totalMinor: true }, orderBy: { createdAt: "asc" } },
  rsvps: { select: { guestEmail: true, user: { select: { email: true } } } },
  event: { select: { title: true, slug: true, timezone: true, organisation: { select: { name: true, slug: true } } } },
} satisfies Prisma.OrderSelect;

type EmailOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect; }>;

type EmailRefund = { automatic: boolean; amountMinor: bigint; status: PaymentRefundStatus; };

function matches(notice: PaymentNotice, payment: { status: PaymentStatus; refunds: EmailRefund[]; }, order: EmailOrder, now: Date) {
  const automaticRefund = payment.refunds.some((refund) => refund.automatic);
  switch (notice) {
    case "pending": return payment.status === PaymentStatus.PENDING && order.status === OrderStatus.PENDING && Boolean(order.holdExpiresAt && order.holdExpiresAt > now);
    case "paid": return (payment.status === PaymentStatus.PAID_ONLINE || payment.status === PaymentStatus.PAID_OFFLINE) && order.status === OrderStatus.CONFIRMED;
    case "expired": return payment.status === PaymentStatus.EXPIRED;
    case "late-refund":
    case "organiser-late-refund": return automaticRefund;
    case "refunded": return payment.refunds.some((refund) => !refund.automatic && refund.status !== PaymentRefundStatus.FAILED);
  }
}

/**
 * Send one queued payment or order notice. Returns "dropped" when the state
 * no longer matches the notice (for example "pending" after it was paid),
 * so the outbox removes the message without sending stale wording.
 */
export async function deliverPaymentEmail(payload: PaymentEmailPayload, messageId: string): Promise<"sent" | "dropped"> {
  const now = new Date();
  let order: EmailOrder | null;
  let payment: { status: PaymentStatus; amountMinor: bigint; testMode: boolean; refunds: EmailRefund[]; } | null = null;
  if ("paymentId" in payload) {
    const row = await prisma.payment.findUnique({
      where: { id: payload.paymentId },
      select: { status: true, amountMinor: true, testMode: true, refunds: { select: { automatic: true, amountMinor: true, status: true } }, order: { select: orderSelect } },
    });
    if (!row || !matches(payload.notice, row, row.order, now)) return "dropped";
    payment = row;
    order = row.order;
  } else {
    order = await prisma.order.findUnique({ where: { id: payload.orderId }, select: orderSelect });
    const missing = order?.rsvps.some((rsvp) => !(rsvp.user?.email || rsvp.guestEmail));
    if (!order || order.status !== OrderStatus.CONFIRMED || !missing) return "dropped";
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  // Links only with an absolute public address; never localhost in a sent email.
  const orderUrl = base ? `${base}/order/${order.accessToken}` : null;
  const receiptUrl = base ? `${base}/api/orders/${order.accessToken}/receipt` : null;
  const eventUrl = base && order.event ? `${base}/${order.event.organisation.slug}/${order.event.slug}` : null;
  const title = oneLine(order.event?.title ?? "your event");
  const amount = formatMoney(payment?.amountMinor ?? order.totalMinor, order.currency);
  const testNote = order.testMode ? " This was a test payment, so no real money moved." : "";
  const hello = order.buyerName ? `Hello ${escapeHtml(oneLine(order.buyerName))},` : "Hello,";
  const holdEnds = order.holdExpiresAt
    ? order.holdExpiresAt.toLocaleString("en-GB", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: order.event?.timezone || "UTC", timeZoneName: "short" })
    : "";

  const refunded = formatMoney((payment?.refunds ?? []).filter((refund) => !refund.automatic && refund.status !== PaymentRefundStatus.FAILED).reduce((sum, refund) => sum + refund.amountMinor, BigInt(0)), order.currency);
  const cancelled = order.status === OrderStatus.CANCELLED;
  const content: Record<PaymentNotice | OrderNotice, { subject: string; heading: string; body: string; button?: { label: string; href: string | null; }; }> = {
    pending: {
      subject: `Complete your payment: ${title}`,
      heading: "Your tickets are held",
      body: `Your tickets for <strong>${escapeHtml(title)}</strong> are held until ${escapeHtml(holdEnds)} while you pay ${escapeHtml(amount)}. They're confirmed as soon as the payment goes through.${testNote}`,
      button: { label: "Pay for your tickets", href: orderUrl },
    },
    paid: {
      subject: `Receipt ${order.reference}: ${title}`,
      heading: "Payment received",
      body: `We received ${escapeHtml(amount)} for <strong>${escapeHtml(title)}</strong>, and your tickets are confirmed. Each attendee with an email address gets their own ticket.${receiptUrl ? ` Your receipt, with the payment details, is a PDF you can <a href="${escapeHtml(receiptUrl)}">download</a> at any time from your order.` : ""}${testNote}`,
      button: { label: "View your order", href: orderUrl },
    },
    expired: {
      subject: `Your held tickets were released: ${title}`,
      heading: "Your held tickets were released",
      body: `The time to pay for <strong>${escapeHtml(title)}</strong> ran out, so the tickets went back on sale. Nothing was charged. You can order again if tickets are still available.`,
      button: { label: "Open the event", href: eventUrl },
    },
    "late-refund": {
      subject: `Payment refunded: ${title}`,
      heading: "Your payment was refunded",
      body: `Your payment of ${escapeHtml(amount)} for <strong>${escapeHtml(title)}</strong> arrived after your held tickets had been released, and there weren't enough places left. We've refunded it in full; your bank may take a few days to show it.${testNote}`,
    },
    "organiser-late-refund": {
      subject: `A late payment was refunded: ${title}`,
      heading: "A late payment was refunded automatically",
      body: `Order ${escapeHtml(order.reference)} paid ${escapeHtml(amount)} for <strong>${escapeHtml(title)}</strong> after its hold had ended and the places were gone, so Space Works Events refunded it in full and told the buyer.${testNote}`,
    },
    refunded: {
      subject: `${cancelled ? "Order cancelled" : "Refund"} ${order.reference}: ${title}`,
      heading: cancelled ? "Your order was cancelled" : "You've been refunded",
      body: `${cancelled ? `Your tickets for <strong>${escapeHtml(title)}</strong> were cancelled. ` : ""}${refunded === formatMoney(0, order.currency) ? "There's nothing to refund." : `We've refunded ${escapeHtml(refunded)} for <strong>${escapeHtml(title)}</strong> in total. Card and UPI refunds can take 5 to 10 working days to appear; money paid in person is returned by the organiser.`}${testNote}`,
      button: { label: "View your order", href: orderUrl },
    },
    "attendee-details": {
      subject: `Add attendee details: ${title}`,
      heading: "Who's coming?",
      body: `Some tickets in order ${escapeHtml(order.reference)} for <strong>${escapeHtml(title)}</strong> don't have an attendee yet. Add each person's name and email so they get their own ticket.`,
      button: { label: "Add attendee details", href: orderUrl },
    },
  };
  const notice = content[payload.notice];
  const lines = order.lines.map((line) => `${escapeHtml(oneLine(checkoutLineName(line)))}: ${escapeHtml(formatMoney(line.totalMinor, order.currency))}`).join("<br>");
  const organisation = order.event ? escapeHtml(order.event.organisation.name) : "";
  const html = emailLayout(escapeHtml(notice.subject), `
            <h2 style="${HEADING}">${notice.heading}</h2>
            <p style="${BODY}">${hello}<br><br>${notice.body}</p>
            <p style="${FACTS}"><strong>Order:</strong> ${escapeHtml(order.reference)}<br>${lines}<br><strong>Total:</strong> ${escapeHtml(formatMoney(order.totalMinor, order.currency))}${order.testMode ? " (test)" : ""}${organisation ? `<br><strong>Organiser:</strong> ${organisation}` : ""}</p>
            ${notice.button?.href ? `<div style="text-align: center; margin: 28px 0;"><a href="${escapeHtml(notice.button.href)}" style="${EMAIL_BUTTON_STYLE}">${notice.button.label}</a></div>` : ""}`);
  const text = [
    notice.heading,
    "",
    order.buyerName ? `Hello ${oneLine(order.buyerName)},` : "Hello,",
    notice.body.replace(/<[^>]+>/g, ""),
    `Order: ${order.reference}`,
    ...order.lines.map((line) => `${checkoutLineName(line)}: ${formatMoney(line.totalMinor, order.currency)}`),
    `Total: ${formatMoney(order.totalMinor, order.currency)}${order.testMode ? " (test)" : ""}`,
    notice.button?.href ? `${notice.button.label}: ${notice.button.href}` : "",
    payload.notice === "paid" && receiptUrl ? `Receipt (PDF): ${receiptUrl}` : "",
  ].filter((line, index) => line || index === 1).join("\n");

  const { transporter, from } = await getEmailTransport();
  if (!transporter) {
    console.log("[EMAIL MOCK] payment notice queued");
    return "sent";
  }
  const result = await transporter.sendMail({ from, to: payload.to, subject: oneLine(notice.subject), html, text, messageId });
  assertEmailAccepted(result);
  return "sent";
}
