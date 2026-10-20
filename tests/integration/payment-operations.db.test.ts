import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, OrderStatus, PaymentRefundStatus, PaymentStatus, RsvpStatus, type RefundPolicyKind } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { startCheckout } from "@/lib/payments/checkout";
import {
  amendOfflinePayment, buyerCancellation, cancelOrderAsBuyer, declineRequestedOrder, offerRequestedOrder,
  refundOrder, sendPaymentLink, settleOrderByHand,
} from "@/lib/payments/operations";
import { promoCodeDigest, promoCodeHint } from "@/lib/payments/promo";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { handleProviderWebhook, settleWebhookEvent } from "@/lib/payments/webhooks";
import { submitManualTicketOrderCore, submitRsvpCore } from "@/lib/rsvpCore";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN, signedPaidWebhook } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "");
const SECRETS = { RAZORPAY: `rzp-webhook-${suffix}`, STRIPE: `whsec_${suffix}` } as const;
const pathId = newWebhookPathId();
const HOUR = 3_600_000;
let organisationId = "";
let orgSlug = "";
let organiserId = "";
let previousPaidEvents: boolean | null = null;
let counter = 0;
const fake = createFakeProvider();

async function createEvent(options: {
  capacity?: number | null; price?: number; privacyType?: EventPrivacyType; startsIn?: number;
  policy?: { kind: RefundPolicyKind; hours?: number; percent?: number; };
} = {}) {
  counter += 1;
  const start = new Date(Date.now() + (options.startsIn ?? 30 * 24 * HOUR));
  const event = await prisma.event.create({
    data: {
      organisationId, title: `Operations event ${counter}`, slug: `ops-${suffix}-${counter}`, currency: "INR",
      startDateTime: start, endDateTime: new Date(start.getTime() + 2 * HOUR), timezone: "UTC",
      capacity: options.capacity ?? null, status: EventStatus.PUBLISHED, privacyType: options.privacyType ?? EventPrivacyType.PUBLIC, page: { create: { isPublished: true } },
      refundPolicyKind: options.policy?.kind ?? "NONE", refundPolicyHours: options.policy?.hours ?? null, refundPolicyPercent: options.policy?.percent ?? null,
    },
  });
  const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(options.price ?? 49900) } });
  return { event, ticket };
}

function buy(eventSlug: string, ticketTypeId: string, email: string, options: { quantity?: number; promoCode?: string; } = {}) {
  return submitRsvpCore({ orgSlug, eventSlug, guestEmail: email, name: "Paying Guest", answers: {}, items: [{ ticketTypeId, quantity: options.quantity ?? 1 }], promoCode: options.promoCode }, { userId: null });
}

async function orderFor(eventId: string, email?: string) {
  return prisma.order.findFirstOrThrow({
    where: { eventId, ...(email ? { buyerEmail: email } : {}) },
    include: { payments: { include: { attempts: true, refunds: true, amendments: true }, orderBy: { createdAt: "asc" } }, rsvps: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Pay the order's open page at the fake provider and deliver the signed webhook. */
async function pay(provider: "RAZORPAY" | "STRIPE", orderId: string) {
  const attempt = await prisma.paymentCheckoutAttempt.findFirstOrThrow({ where: { payment: { orderId }, status: "OPEN" }, orderBy: { createdAt: "desc" } });
  fake.pay(attempt.externalId!);
  const page = fake.pages.get(attempt.externalId!)!;
  const response = await handleProviderWebhook(signedPaidWebhook(page, SECRETS[provider], `/api/webhooks/${provider.toLowerCase()}/${pathId}`), provider, pathId, settleWebhookEvent);
  expect(response.status).toBe(200);
}

async function boughtAndPaid(provider: "RAZORPAY" | "STRIPE", event: { id: string; slug: string; }, ticketTypeId: string, email: string) {
  expect(await buy(event.slug, ticketTypeId, email)).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
  const order = await orderFor(event.id, email);
  await pay(provider, order.id);
  return orderFor(event.id, email);
}

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  const organisation = await prisma.organisation.create({ data: { name: "Operations org", slug: `ops-org-${suffix}` } });
  organisationId = organisation.id;
  orgSlug = organisation.slug;
  organiserId = (await prisma.user.create({ data: { email: `organiser-${suffix}@example.test`, name: "Organiser" } })).id;
  await prisma.membership.create({ data: { organisationId, userId: organiserId, role: "OWNER" } });
  await prisma.organisationPaymentSettings.create({ data: {
    organisationId, provider: "RAZORPAY", webhookPathId: pathId, razorpayKeyId: "rzp_test_abcdef",
    razorpayKeySecretEncrypted: encryptPaymentSecret(organisationId, "razorpayKeySecretEncrypted", "secretvalue"),
    razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "razorpayWebhookSecretEncrypted", SECRETS.RAZORPAY),
    stripeSecretKeyEncrypted: encryptPaymentSecret(organisationId, "stripeSecretKeyEncrypted", "sk_test_abcdefghijkl"),
    stripeWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "stripeWebhookSecretEncrypted", SECRETS.STRIPE),
    stripeTestMode: true,
  } });
  previousPaidEvents = (await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID } }))?.paidEventsEnabled ?? null;
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, paidEventsEnabled: true }, update: { paidEventsEnabled: true } });
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.user.deleteMany({ where: { id: organiserId } });
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: previousPaidEvents } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe.sequential.each(["RAZORPAY", "STRIPE"] as const)("payment operations on %s", (provider) => {
  const email = (name: string) => `${name}-${provider.toLowerCase()}-${suffix}@example.test`;

  beforeEach(async () => {
    await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider } });
  });

  it("takes a paid request without charging, and approval offers a day-long hold that payment confirms", async () => {
    const { event, ticket } = await createEvent({ privacyType: EventPrivacyType.APPROVAL_REQUIRED });
    expect(await buy(event.slug, ticket.id, email("ask"))).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_APPROVAL, checkoutUrl: null } });
    const requested = await orderFor(event.id);
    expect(requested).toMatchObject({ status: OrderStatus.REQUESTED, payments: [], holdExpiresAt: null });

    await offerRequestedOrder({ orderId: requested.id, organisationId, actorUserId: organiserId });
    const offered = await orderFor(event.id);
    expect(offered.status).toBe(OrderStatus.PENDING);
    expect(offered.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
    expect(offered.payments).toEqual([expect.objectContaining({ status: PaymentStatus.PENDING, provider, amountMinor: BigInt(49900) })]);
    expect(offered.rsvps.map((rsvp) => rsvp.status)).toEqual([RsvpStatus.PENDING_PAYMENT]);
    expect(await prisma.outboxMessage.count({ where: { kind: "payment-notice", payload: { path: ["paymentId"], equals: offered.payments[0]!.id } } })).toBe(1);
    // A second approval can't offer it twice.
    await expect(offerRequestedOrder({ orderId: requested.id, organisationId, actorUserId: organiserId })).rejects.toThrow("This request was changed by someone else.");

    // The page opens only when they click Pay, within the provider's page lifetime.
    expect(await startCheckout(offered.id)).toMatchObject({ url: expect.any(String) });
    await pay(provider, offered.id);
    const paid = await orderFor(event.id);
    expect(paid.status).toBe(OrderStatus.CONFIRMED);
    expect(paid.rsvps[0]!.status).toBe(RsvpStatus.CONFIRMED);
  });

  it("declines a request without charging and rejects its registrations", async () => {
    const { event, ticket } = await createEvent({ privacyType: EventPrivacyType.APPROVAL_REQUIRED });
    await buy(event.slug, ticket.id, email("decline"), { quantity: 2 });
    const order = await orderFor(event.id);
    await declineRequestedOrder({ orderId: order.id, organisationId, actorUserId: organiserId });
    const declined = await orderFor(event.id);
    expect(declined.status).toBe(OrderStatus.CANCELLED);
    expect(declined.rsvps.map((rsvp) => rsvp.status)).toEqual([RsvpStatus.REJECTED, RsvpStatus.REJECTED]);
  });

  it("waitlists a sold-out paid event, and a cancelled order's place goes to the waitlist as a payment link", async () => {
    const { event, ticket } = await createEvent({ capacity: 1 });
    const first = await boughtAndPaid(provider, event, ticket.id, email("first"));
    expect(first.status).toBe(OrderStatus.CONFIRMED);
    expect(await buy(event.slug, ticket.id, email("waiting"))).toMatchObject({ ok: true, data: { status: RsvpStatus.WAITLISTED, checkoutUrl: null } });
    expect((await orderFor(event.id, email("waiting"))).status).toBe(OrderStatus.REQUESTED);

    const refundsBefore = fake.refunds.length;
    await refundOrder({ orderId: first.id, organisationId, actorUserId: organiserId, amountMinor: null, reason: "Can't attend", cancelTickets: true });
    const cancelled = await orderFor(event.id, email("first"));
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(cancelled.rsvps).toEqual([]);
    expect(cancelled.payments[0]!.refunds).toEqual([expect.objectContaining({ amountMinor: BigInt(49900), status: PaymentRefundStatus.SUCCEEDED, externalRefundId: expect.any(String) })]);
    expect(fake.refunds.length).toBe(refundsBefore + 1);
    // The buyer is told; the next in line is offered the place.
    expect(await prisma.outboxMessage.count({ where: { kind: "payment-notice", payload: { path: ["notice"], equals: "refunded" }, AND: { payload: { path: ["paymentId"], equals: cancelled.payments[0]!.id } } } })).toBe(1);
    const offered = await orderFor(event.id, email("waiting"));
    expect(offered.status).toBe(OrderStatus.PENDING);
    expect(offered.rsvps[0]!.status).toBe(RsvpStatus.PENDING_PAYMENT);
  });

  it("refunds in part, and never more than was paid even for concurrent refunds", async () => {
    const { event, ticket } = await createEvent();
    const order = await boughtAndPaid(provider, event, ticket.id, email("partial"));
    await refundOrder({ orderId: order.id, organisationId, actorUserId: organiserId, amountMinor: BigInt(20000), reason: "Parking refund", cancelTickets: false });
    const results = await Promise.allSettled([1, 2].map(() => refundOrder({ orderId: order.id, organisationId, actorUserId: organiserId, amountMinor: BigInt(20000), reason: "Twice", cancelTickets: false })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ message: "You can refund up to ₹99.00 on this order." }) });
    const after = await orderFor(event.id);
    expect(after.status).toBe(OrderStatus.CONFIRMED);
    expect(after.rsvps[0]!.status).toBe(RsvpStatus.CONFIRMED);
    expect(after.payments[0]!.refunds.reduce((sum, refund) => sum + refund.amountMinor, BigInt(0))).toBe(BigInt(40000));
  });

  it("settles by hand only after closing the provider page, and corrects offline records only by amendment", async () => {
    const { event, ticket } = await createEvent();
    await buy(event.slug, ticket.id, email("desk"));
    const pending = await orderFor(event.id);
    const page = fake.pages.get(pending.payments[0]!.attempts[0]!.externalId!)!;
    expect(await settleOrderByHand({ orderId: pending.id, organisationId, actorUserId: organiserId, mode: "offline", method: "CASH", reference: "R-1" })).toBe("confirmed");
    expect(page.status).toBe("closed");
    const settled = await orderFor(event.id);
    expect(settled.status).toBe(OrderStatus.CONFIRMED);
    expect(settled.payments[0]).toMatchObject({ status: PaymentStatus.PAID_OFFLINE, offlineMethod: "CASH", offlineReference: "R-1", settledByUserId: organiserId });
    expect(settled.payments[0]!.attempts[0]!.status).toBe("CANCELLED");

    await amendOfflinePayment({ paymentId: settled.payments[0]!.id, organisationId, actorUserId: organiserId, method: "UPI", reference: "UTR-9", reason: "Paid by UPI, not cash" });
    const amended = await orderFor(event.id);
    expect(amended.payments[0]).toMatchObject({ offlineMethod: "CASH", offlineReference: "R-1" });
    expect(amended.payments[0]!.amendments.map((row) => [row.field, row.oldValue, row.newValue])).toEqual(expect.arrayContaining([["offlineMethod", "CASH", "UPI"], ["offlineReference", "R-1", "UTR-9"]]));
    await expect(prisma.paymentAmendment.update({ where: { id: amended.payments[0]!.amendments[0]!.id }, data: { reason: "rewrite" } })).rejects.toThrow();
    await expect(prisma.payment.update({ where: { id: settled.payments[0]!.id }, data: { offlineReference: "edited" } })).rejects.toThrow();

    // Money paid in person is returned in person: recorded, never sent to the provider.
    const refundsBefore = fake.refunds.length;
    await refundOrder({ orderId: settled.id, organisationId, actorUserId: organiserId, amountMinor: BigInt(10000), reason: "Partial", cancelTickets: false });
    expect((await orderFor(event.id)).payments[0]!.refunds).toEqual([expect.objectContaining({ offline: true, status: PaymentRefundStatus.SUCCEEDED, amountMinor: BigInt(10000) })]);
    expect(fake.refunds.length).toBe(refundsBefore);
  });

  it("keeps an online payment that arrived first instead of settling by hand, and waives a pending order", async () => {
    const paidFirst = await createEvent();
    await buy(paidFirst.event.slug, paidFirst.ticket.id, email("raced"));
    const order = await orderFor(paidFirst.event.id);
    fake.pay(order.payments[0]!.attempts[0]!.externalId!);
    expect(await settleOrderByHand({ orderId: order.id, organisationId, actorUserId: organiserId, mode: "offline", method: "CASH" })).toBe("already-paid");
    expect((await orderFor(paidFirst.event.id)).payments[0]!.status).toBe(PaymentStatus.PAID_ONLINE);

    const comp = await createEvent();
    await buy(comp.event.slug, comp.ticket.id, email("comp"));
    const pending = await orderFor(comp.event.id);
    expect(await settleOrderByHand({ orderId: pending.id, organisationId, actorUserId: organiserId, mode: "waive" })).toBe("confirmed");
    const waived = await orderFor(comp.event.id);
    expect(waived.payments[0]).toMatchObject({ status: PaymentStatus.WAIVED, paidAt: null });
    expect(waived.rsvps[0]!.status).toBe(RsvpStatus.CONFIRMED);
    await expect(refundOrder({ orderId: waived.id, organisationId, actorUserId: organiserId, amountMinor: null, reason: "x", cancelTickets: false })).rejects.toThrow("Enter an amount to refund.");
    await refundOrder({ orderId: waived.id, organisationId, actorUserId: organiserId, amountMinor: null, reason: "Not coming", cancelTickets: true });
    expect((await orderFor(comp.event.id)).status).toBe(OrderStatus.CANCELLED);
  });

  it("prices promo codes under the lock, and a limited code is never used more than allowed", async () => {
    const { event, ticket } = await createEvent();
    const code = `HALF${counter}`;
    await prisma.promoCode.create({ data: { eventId: event.id, codeDigest: promoCodeDigest(code), hint: promoCodeHint(code), kind: "PERCENT", percentOff: 50, maxRedemptions: 1 } });
    const results = await Promise.all([1, 2, 3].map((n) => buy(event.slug, ticket.id, email(`promo-${n}`), { promoCode: code.toLowerCase() })));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => !result.ok && result.error)).toEqual(["That promo code has been used up.", "That promo code has been used up."]);
    const order = await orderFor(event.id);
    expect(order).toMatchObject({ subtotalMinor: BigInt(49900), discountMinor: BigInt(24950), totalMinor: BigInt(24950), promoCodeId: expect.any(String) });
    const page = fake.pages.get(order.payments[0]!.attempts[0]!.externalId!)!;
    expect(page.amount).toBe(24950);
    expect(await buy(event.slug, ticket.id, email("promo-bad"), { promoCode: "NOPE123" })).toEqual({ ok: false, error: "That promo code isn't valid." });
  });

  it("lets buyers cancel under the policy frozen on their order, and not after its deadline", async () => {
    const full = await createEvent({ policy: { kind: "FULL_UNTIL", hours: 48 } });
    const order = await boughtAndPaid(provider, full.event, full.ticket.id, email("cancel-full"));
    expect(order.refundPolicy).toMatchObject({ kind: "FULL_UNTIL", hours: 48 });
    // Tightening the event's policy later doesn't change what this buyer was sold.
    await prisma.event.update({ where: { id: full.event.id }, data: { refundPolicyKind: "NONE", refundPolicyHours: null } });
    expect(await buyerCancellation(order.id)).toEqual({ refundMinor: BigInt(49900) });
    await cancelOrderAsBuyer({ orderId: order.id });
    const cancelled = await orderFor(full.event.id);
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(cancelled.payments[0]!.refunds).toEqual([expect.objectContaining({ amountMinor: BigInt(49900), status: PaymentRefundStatus.SUCCEEDED })]);

    const half = await createEvent({ policy: { kind: "PERCENT_UNTIL", hours: 24, percent: 50 } });
    const halfOrder = await boughtAndPaid(provider, half.event, half.ticket.id, email("cancel-half"));
    await cancelOrderAsBuyer({ orderId: halfOrder.id });
    expect((await orderFor(half.event.id)).payments[0]!.refunds[0]!.amountMinor).toBe(BigInt(24950));

    const late = await createEvent({ startsIn: 12 * HOUR, policy: { kind: "FULL_UNTIL", hours: 24 } });
    const lateOrder = await boughtAndPaid(provider, late.event, late.ticket.id, email("cancel-late"));
    expect(await buyerCancellation(lateOrder.id)).toBeNull();
    await expect(cancelOrderAsBuyer({ orderId: lateOrder.id })).rejects.toThrow("This order can't be cancelled online. Contact the organiser.");
  });

  it("adds paid guests by payment link, as paid in person, or complimentary", async () => {
    const { event, ticket } = await createEvent({ capacity: 3 });
    const add = (name: string, payment: "link" | "offline" | "waive") => submitManualTicketOrderCore(
      { eventId: event.id, name: "Desk Guest", guestEmail: email(name), ticketTypeId: ticket.id, payment, method: payment === "offline" ? "UPI" : undefined, reference: null, answers: {} },
      { organisationId, actorUserId: organiserId },
    );
    expect(await add("linked", "link")).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    const linked = await orderFor(event.id, email("linked"));
    expect(linked.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
    expect(linked.payments).toEqual([expect.objectContaining({ status: PaymentStatus.PENDING, provider })]);
    expect(linked.payments[0]!.attempts).toEqual([]);

    expect(await add("cash", "offline")).toMatchObject({ ok: true, data: { status: RsvpStatus.CONFIRMED } });
    expect((await orderFor(event.id, email("cash"))).payments[0]).toMatchObject({ status: PaymentStatus.PAID_OFFLINE, offlineMethod: "UPI", settledByUserId: organiserId });
    expect(await add("free", "waive")).toMatchObject({ ok: true, data: { status: RsvpStatus.CONFIRMED } });
    expect((await orderFor(event.id, email("free"))).payments[0]!.status).toBe(PaymentStatus.WAIVED);
    // Full now: money taken by hand can't wait on the list.
    expect(await add("overflow", "offline")).toEqual({ ok: false, error: "There's no free place for this guest. Free one first, or send them a payment link to join the waitlist." });
  });

  it("reopens an expired order with a fresh payment link while its places are free", async () => {
    const { event, ticket } = await createEvent({ capacity: 5 });
    await buy(event.slug, ticket.id, email("expired"));
    const order = await orderFor(event.id);
    await prisma.paymentCheckoutAttempt.updateMany({ where: { paymentId: order.payments[0]!.id }, data: { status: "EXPIRED" } });
    await prisma.payment.update({ where: { id: order.payments[0]!.id }, data: { status: PaymentStatus.EXPIRED } });
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.EXPIRED, holdExpiresAt: null, holdCapAt: null } });
    await prisma.rSVP.updateMany({ where: { orderId: order.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    expect(await sendPaymentLink({ orderId: order.id, organisationId, actorUserId: organiserId })).toBe("reopened");
    const reopened = await orderFor(event.id);
    expect(reopened.status).toBe(OrderStatus.PENDING);
    expect(reopened.payments.map((payment) => payment.status)).toEqual([PaymentStatus.EXPIRED, PaymentStatus.PENDING]);
    expect(await sendPaymentLink({ orderId: order.id, organisationId, actorUserId: organiserId })).toBe("resent");
  });
});
