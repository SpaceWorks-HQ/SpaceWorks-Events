import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, OrderStatus, PaymentStatus, RsvpStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { startCheckout } from "@/lib/payments/checkout";
import { runPaymentMaintenance } from "@/lib/payments/maintenance";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { settlePaidNotification } from "@/lib/payments/settlement";
import { handleProviderWebhook, settleWebhookEvent } from "@/lib/payments/webhooks";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN, signedPaidWebhook } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "");
const SECRETS = { RAZORPAY: `rzp-webhook-${suffix}`, STRIPE: `whsec_${suffix}` } as const;
const pathId = newWebhookPathId();
let organisationId = "";
let orgSlug = "";
let previousPaidEvents: boolean | null = null;
let counter = 0;
const fake = createFakeProvider();

async function createEvent(options: { capacity?: number | null; ticketCapacity?: number | null; price?: number; privacyType?: EventPrivacyType; maxPerOrder?: number; } = {}) {
  counter += 1;
  const event = await prisma.event.create({
    data: {
      organisationId, title: `Paid event ${counter}`, slug: `paid-${suffix}-${counter}`, currency: "INR",
      startDateTime: new Date("2035-01-01T10:00:00.000Z"), endDateTime: new Date("2035-01-01T12:00:00.000Z"), timezone: "UTC",
      capacity: options.capacity ?? null, status: EventStatus.PUBLISHED, privacyType: options.privacyType ?? EventPrivacyType.PUBLIC, page: { create: { isPublished: true } },
    },
  });
  const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(options.price ?? 49900), capacity: options.ticketCapacity ?? null, maxPerOrder: options.maxPerOrder ?? 10 } });
  return { event, ticket };
}

function buy(eventSlug: string, ticketTypeId: string, email: string, quantity = 1, attendees: Array<{ name?: string; email?: string; }> = []) {
  return submitRsvpCore({ orgSlug, eventSlug, guestEmail: email, name: "Paying Guest", answers: {}, items: [{ ticketTypeId, quantity }], attendees }, { userId: null });
}

async function orderFor(eventId: string) {
  return prisma.order.findFirstOrThrow({ where: { eventId }, include: { payments: { include: { attempts: true } }, rsvps: true, lines: true }, orderBy: { createdAt: "desc" } });
}

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  const organisation = await prisma.organisation.create({ data: { name: "Paid org", slug: `paid-org-${suffix}` } });
  organisationId = organisation.id;
  orgSlug = organisation.slug;
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
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: previousPaidEvents } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe.sequential.each(["RAZORPAY", "STRIPE"] as const)("paid orders on %s", (provider) => {
  beforeEach(async () => {
    await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider } });
  });

  it("holds the seats, opens a provider page referenced by a checkout attempt, and settles from the signed webhook", async () => {
    const { event, ticket } = await createEvent({ capacity: 10 });
    const result = await buy(event.slug, ticket.id, `buyer-${provider}-${suffix}@example.test`, 2, [{ name: "Second Person", email: `second-${provider}-${suffix}@example.test` }]);
    expect(result).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT, checkoutUrl: expect.stringMatching(/^https:\/\//) } });
    const order = await orderFor(event.id);
    expect(order).toMatchObject({ status: OrderStatus.PENDING, totalMinor: BigInt(99800), currency: "INR", testMode: true });
    expect(order.lines).toEqual([expect.objectContaining({ quantity: 2, unitMinor: BigInt(49900), totalMinor: BigInt(99800) })]);
    expect(order.rsvps.map((rsvp) => rsvp.status)).toEqual([RsvpStatus.PENDING_PAYMENT, RsvpStatus.PENDING_PAYMENT]);
    const attempt = order.payments[0]!.attempts[0]!;
    const page = [...fake.pages.values()].find((candidate) => candidate.id === attempt.externalId)!;
    // The attempt id is the provider reference, and the page lives inside the provider's window.
    expect(page.reference).toBe(attempt.id);
    expect(page.amount).toBe(99800);
    const minimum = provider === "STRIPE" ? 30 * 60_000 : 15 * 60_000;
    expect(page.expiresAt * 1000 - Date.now()).toBeGreaterThanOrEqual(minimum);
    if (provider === "STRIPE") expect(order.holdExpiresAt!.getTime()).toBeGreaterThanOrEqual(Date.now() + 31 * 60_000);

    fake.pay(page.id);
    const webhook = () => signedPaidWebhook(fake.pages.get(page.id)!, SECRETS[provider], `/api/webhooks/${provider.toLowerCase()}/${pathId}`);
    expect((await handleProviderWebhook(webhook(), provider, pathId, settleWebhookEvent)).status).toBe(200);
    expect((await handleProviderWebhook(webhook(), provider, pathId, settleWebhookEvent)).status).toBe(200);
    const settled = await orderFor(event.id);
    expect(settled.status).toBe(OrderStatus.CONFIRMED);
    expect(settled.payments).toEqual([expect.objectContaining({ status: PaymentStatus.PAID_ONLINE, externalPaymentId: fake.pages.get(page.id)!.paymentId })]);
    expect(settled.payments[0]!.attempts[0]!.status).toBe("PAID");
    expect(settled.rsvps.map((rsvp) => rsvp.status)).toEqual([RsvpStatus.CONFIRMED, RsvpStatus.CONFIRMED]);
  });

  it("reuses an open page, and gives each new page its own reference", async () => {
    const { event, ticket } = await createEvent();
    await buy(event.slug, ticket.id, `retry-${provider}-${suffix}@example.test`);
    const order = await orderFor(event.id);
    const first = order.payments[0]!.attempts[0]!;
    expect(await startCheckout(order.id)).toEqual({ url: first.url });
    // The first page ends early (for example the buyer abandoned it).
    await prisma.paymentCheckoutAttempt.update({ where: { id: first.id }, data: { status: "EXPIRED" } });
    const second = await startCheckout(order.id);
    expect(second).toMatchObject({ url: expect.any(String) });
    const attempts = (await orderFor(event.id)).payments[0]!.attempts;
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(2);
    const references = [...fake.pages.values()].filter((page) => attempts.some((attempt) => attempt.externalId === page.id)).map((page) => page.reference);
    expect(new Set(references).size).toBe(2);
  });

  it("refuses to open a page the hold can no longer cover", async () => {
    const { event, ticket } = await createEvent();
    await buy(event.slug, ticket.id, `ending-${provider}-${suffix}@example.test`);
    const order = await orderFor(event.id);
    await prisma.paymentCheckoutAttempt.updateMany({ where: { paymentId: order.payments[0]!.id }, data: { status: "EXPIRED" } });
    const soon = new Date(Date.now() + 5 * 60_000);
    await prisma.order.update({ where: { id: order.id }, data: { holdExpiresAt: soon, holdCapAt: soon } });
    expect(await startCheckout(order.id)).toEqual({ error: "hold_ending" });
  });

  it("never sells more seats than are left, even for concurrent orders", async () => {
    const { event, ticket } = await createEvent({ capacity: 3 });
    const results = await Promise.all([1, 2, 3].map((n) => buy(event.slug, ticket.id, `race-${provider}-${n}-${suffix}@example.test`, 2)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => !result.ok && result.error)).toEqual(["Only 1 place left.", "Only 1 place left."]);
    expect(await prisma.rSVP.count({ where: { eventId: event.id } })).toBe(2);
  });

  it("releases an ended hold only after closing the provider page, and refunds a payment that arrives after the seats are gone", async () => {
    const { event, ticket } = await createEvent({ capacity: 1 });
    await buy(event.slug, ticket.id, `slow-${provider}-${suffix}@example.test`);
    const slow = await orderFor(event.id);
    const page = fake.pages.get(slow.payments[0]!.attempts[0]!.externalId!)!;
    await prisma.order.update({ where: { id: slow.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await prisma.rSVP.updateMany({ where: { orderId: slow.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await runPaymentMaintenance();
    expect(page.status).toBe("closed");
    expect((await orderFor(event.id)).status).toBe(OrderStatus.EXPIRED);
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: slow.id } })).status).toBe(PaymentStatus.EXPIRED);

    expect(await buy(event.slug, ticket.id, `fast-${provider}-${suffix}@example.test`)).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    const late = await prisma.$transaction((tx) => settlePaidNotification(tx, { organisationId, provider }, {
      checkoutId: page.id, reference: page.reference, paymentId: `late_${provider}_${suffix}`, amountMinor: BigInt(49900), currency: "INR",
    }));
    expect(late.outcome).toBe("refunding");
    const refunded = await prisma.payment.findFirstOrThrow({ where: { orderId: slow.id }, include: { refunds: true } });
    expect(refunded.status).toBe(PaymentStatus.PAID_ONLINE);
    expect(refunded.refunds).toEqual([expect.objectContaining({ amountMinor: BigInt(49900), automatic: true })]);
  });

  it("settles instead of releasing when the buyer paid just before the hold ended", async () => {
    const { event, ticket } = await createEvent({ capacity: 5 });
    await buy(event.slug, ticket.id, `close-${provider}-${suffix}@example.test`);
    const order = await orderFor(event.id);
    fake.pay(order.payments[0]!.attempts[0]!.externalId!);
    await prisma.order.update({ where: { id: order.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await runPaymentMaintenance();
    const after = await orderFor(event.id);
    // The seat was free again, so the late payment keeps it.
    expect(after.status).toBe(OrderStatus.CONFIRMED);
    expect(after.rsvps[0]!.status).toBe(RsvpStatus.CONFIRMED);
  });

  it("refuses totals below the provider minimum, and takes paid requests on approval events without charging", async () => {
    const tiny = await createEvent({ price: provider === "RAZORPAY" ? 99 : 49 });
    expect(await buy(tiny.event.slug, tiny.ticket.id, `tiny-${provider}-${suffix}@example.test`)).toEqual({
      ok: false, error: `The total is below the smallest payment the provider accepts (${provider === "RAZORPAY" ? "₹1.00" : "₹0.50"}).`,
    });
    const approval = await createEvent({ privacyType: EventPrivacyType.APPROVAL_REQUIRED });
    expect(await buy(approval.event.slug, approval.ticket.id, `ask-${provider}-${suffix}@example.test`)).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_APPROVAL, checkoutUrl: null } });
    expect(await orderFor(approval.event.id)).toMatchObject({ status: OrderStatus.REQUESTED, payments: [], holdExpiresAt: null });
  });
});

describe.sequential("free and multi-ticket orders", () => {
  it("confirms a free order at once and asks the buyer for missing attendee details", async () => {
    const { event, ticket } = await createEvent({ price: 0 });
    const result = await buy(event.slug, ticket.id, `free-${suffix}@example.test`, 3, [{ name: "Named Friend", email: `friend-${suffix}@example.test` }]);
    expect(result).toMatchObject({ ok: true, data: { status: RsvpStatus.CONFIRMED, checkoutUrl: null } });
    const order = await orderFor(event.id);
    expect(order).toMatchObject({ status: OrderStatus.CONFIRMED, totalMinor: BigInt(0), payments: [] });
    expect(order.rsvps.map((rsvp) => rsvp.guestEmail)).toEqual([`free-${suffix}@example.test`, `friend-${suffix}@example.test`, null]);
    expect(order.rsvps[2]!.attendeeKey).toBe(`order:${order.id}:2`);
    expect(await prisma.outboxMessage.count({ where: { kind: "payment-notice", payload: { path: ["orderId"], equals: order.id } } })).toBe(1);
  });

  it("enforces per-order limits, distinct attendees, and ticket type capacity", async () => {
    const { event, ticket } = await createEvent({ ticketCapacity: 2, maxPerOrder: 2 });
    expect(await buy(event.slug, ticket.id, `limit-${suffix}@example.test`, 3)).toEqual({ ok: false, error: "General: up to 2 per order." });
    expect(await buy(event.slug, ticket.id, `same-${suffix}@example.test`, 2, [{ email: `same-${suffix}@example.test` }]))
      .toEqual({ ok: false, error: "Each ticket needs a different email address, or leave extra ones blank." });
    expect((await buy(event.slug, ticket.id, `first-${suffix}@example.test`, 2)).ok).toBe(true);
    // A sold-out paid ticket takes a waitlist request instead; nothing is held or charged.
    expect(await buy(event.slug, ticket.id, `third-${suffix}@example.test`)).toMatchObject({ ok: true, data: { status: RsvpStatus.WAITLISTED, checkoutUrl: null } });
    expect(await buy(event.slug, ticket.id, `fourth-${suffix}@example.test`, 2)).toMatchObject({ ok: true, data: { status: RsvpStatus.WAITLISTED } });
  });
});
