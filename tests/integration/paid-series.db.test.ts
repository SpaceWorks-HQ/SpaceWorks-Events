import { randomUUID } from "node:crypto";
import { EventStatus, OrderStatus, PaymentRefundStatus, PaymentStatus, RsvpStatus, TicketTypeKind } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { cancelOccurrence, setOccurrenceCapacity } from "@/lib/payments/occurrences";
import { PaymentOperationError } from "@/lib/payments/operations";
import { promoCodeDigest, promoCodeHint } from "@/lib/payments/promo";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { settlePaidNotification } from "@/lib/payments/settlement";
import { handleProviderWebhook, settleWebhookEvent } from "@/lib/payments/webhooks";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN, signedPaidWebhook } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
const SECRET = `rzp-webhook-${suffix}`;
const pathId = newWebhookPathId();
const fake = createFakeProvider();
const DAY = 86_400_000;
let organisationId = "";
let actor = "";
let orgSlug = "";
let previousPaidEvents: boolean | null = null;
let counter = 0;

/** A published series with three dates ahead and one in the past. */
async function createSeries(options: { capacity?: number | null; } = {}) {
  counter += 1;
  const series = await prisma.eventSeries.create({
    data: {
      organisationId, title: `Course ${counter}`, slug: `course-${suffix}-${counter}`, recurrenceRule: "FREQ=WEEKLY;COUNT=4", timezone: "Asia/Kolkata",
      status: EventStatus.PUBLISHED, capacity: options.capacity ?? null, currency: "INR",
    },
  });
  const base = Date.now();
  const dates = [];
  for (const offset of [-7, 7, 14, 21]) {
    dates.push(await prisma.eventInstance.create({ data: { eventSeriesId: series.id, startDateTime: new Date(base + offset * DAY), endDateTime: new Date(base + offset * DAY + 2 * 3_600_000) } }));
  }
  const [past, first, second, third] = dates as [typeof dates[number], typeof dates[number], typeof dates[number], typeof dates[number]];
  const single = await prisma.ticketType.create({ data: { eventSeriesId: series.id, name: "Drop-in", priceMinor: BigInt(30000) } });
  const pass = await prisma.ticketType.create({ data: { eventSeriesId: series.id, kind: TicketTypeKind.PASS, name: "Course pass", priceMinor: BigInt(60000), capacity: 2 } });
  return { series, past, first, second, third, single, pass };
}

function buy(eventInstanceId: string, email: string, items: Array<{ ticketTypeId: string; quantity: number; }>, promoCode?: string) {
  return submitRsvpCore({ orgSlug, eventInstanceId, guestEmail: email, name: "Series Buyer", answers: {}, items, attendees: [], ...(promoCode ? { promoCode } : {}) }, { userId: null });
}

async function orderBy(email: string) {
  return prisma.order.findFirstOrThrow({ where: { buyerEmail: email }, include: { payments: { include: { attempts: true, refunds: true } }, rsvps: { include: { eventInstance: true } }, lines: true }, orderBy: { createdAt: "desc" } });
}

/** The buyer pays on the provider's page; its signed webhook settles the order. */
async function pay(email: string) {
  const order = await orderBy(email);
  const page = [...fake.pages.values()].find((candidate) => candidate.id === order.payments[0]!.attempts[0]!.externalId)!;
  fake.pay(page.id);
  const response = await handleProviderWebhook(signedPaidWebhook(fake.pages.get(page.id)!, SECRET, `/api/webhooks/razorpay/${pathId}`), "RAZORPAY", pathId, settleWebhookEvent);
  expect(response.status).toBe(200);
  return orderBy(email);
}

const email = (name: string) => `${name}-${suffix}@example.test`;

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  const organisation = await prisma.organisation.create({ data: { name: "Series org", slug: `series-org-${suffix}` } });
  organisationId = organisation.id;
  orgSlug = organisation.slug;
  actor = (await prisma.user.create({ data: { name: "Organiser", email: email("organiser"), emailVerified: new Date() } })).id;
  await prisma.organisationPaymentSettings.create({ data: {
    organisationId, provider: "RAZORPAY", webhookPathId: pathId, razorpayKeyId: "rzp_test_abcdef",
    razorpayKeySecretEncrypted: encryptPaymentSecret(organisationId, "razorpayKeySecretEncrypted", "secretvalue"),
    razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "razorpayWebhookSecretEncrypted", SECRET),
  } });
  previousPaidEvents = (await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID } }))?.paidEventsEnabled ?? null;
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, paidEventsEnabled: true }, update: { paidEventsEnabled: true } });
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.user.deleteMany({ where: { id: actor } });
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: previousPaidEvents } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe.sequential("paid series", { timeout: 30_000 }, () => {
  it("sells one date's tickets as an order for that date, settled by the webhook", async () => {
    const { series, first, second, single } = await createSeries();
    expect(await buy(first.id, email("drop-in"), [{ ticketTypeId: single.id, quantity: 2 }])).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT, checkoutUrl: expect.stringContaining("rzp.example") } });
    const settled = await pay(email("drop-in"));
    expect(settled).toMatchObject({ status: OrderStatus.CONFIRMED, eventId: null, eventSeriesId: series.id, eventInstanceId: first.id, totalMinor: BigInt(60000) });
    expect(settled.rsvps.map((rsvp) => [rsvp.eventInstanceId, rsvp.status])).toEqual([[first.id, RsvpStatus.CONFIRMED], [first.id, RsvpStatus.CONFIRMED]]);
    expect(settled.payments[0]).toMatchObject({ status: PaymentStatus.PAID_ONLINE, description: expect.stringContaining(series.title) });
    expect(await prisma.rSVP.count({ where: { eventInstanceId: second.id } })).toBe(0);
  });

  it("counts each date's own capacity, and waits on the list when that date is full", async () => {
    const { first, second, single } = await createSeries({ capacity: 5 });
    await setOccurrenceCapacity({ organisationId, seriesId: first.eventSeriesId, instanceId: first.id, capacity: 1, actorUserId: actor });
    await buy(first.id, email("cap-a"), [{ ticketTypeId: single.id, quantity: 1 }]);
    await pay(email("cap-a"));
    expect(await buy(first.id, email("cap-b"), [{ ticketTypeId: single.id, quantity: 1 }])).toMatchObject({ ok: true, data: { status: RsvpStatus.WAITLISTED, checkoutUrl: null } });
    expect(await orderBy(email("cap-b"))).toMatchObject({ status: OrderStatus.REQUESTED, payments: [] });
    // Another date keeps the series capacity.
    expect(await buy(second.id, email("cap-c"), [{ ticketTypeId: single.id, quantity: 2 }])).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    await expect(setOccurrenceCapacity({ organisationId, seriesId: first.eventSeriesId, instanceId: second.id, capacity: 1, actorUserId: actor })).rejects.toThrow(PaymentOperationError);
  });

  it("sells passes that seat each holder on every remaining date, limited by passes", async () => {
    const { series, past, first, second, third, pass } = await createSeries();
    expect(await buy(first.id, email("pass-a"), [{ ticketTypeId: pass.id, quantity: 2 }])).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    const order = await pay(email("pass-a"));
    expect(order).toMatchObject({ status: OrderStatus.CONFIRMED, eventSeriesId: series.id, eventInstanceId: null, totalMinor: BigInt(120000) });
    // Two people on each of the three dates still ahead; none on the past one.
    expect(order.rsvps).toHaveLength(6);
    expect(new Set(order.rsvps.map((rsvp) => rsvp.eventInstanceId))).toEqual(new Set([first.id, second.id, third.id]));
    expect(order.rsvps.some((rsvp) => rsvp.eventInstanceId === past.id)).toBe(false);
    expect(order.rsvps.every((rsvp) => rsvp.status === RsvpStatus.CONFIRMED)).toBe(true);
    expect(new Set(order.rsvps.map((rsvp) => rsvp.attendeeKey)).size).toBe(2);
    // The pass type's limit is two passes.
    expect(await buy(second.id, email("pass-b"), [{ ticketTypeId: pass.id, quantity: 1 }])).toEqual({ ok: false, error: "Course pass is sold out." });
  });

  it("refuses a pass when any covered date is full, and never mixes passes with single dates", async () => {
    const { first, second, single, pass } = await createSeries({ capacity: 2 });
    await buy(second.id, email("full-a"), [{ ticketTypeId: single.id, quantity: 2 }]);
    expect(await buy(first.id, email("full-b"), [{ ticketTypeId: pass.id, quantity: 1 }])).toEqual({ ok: false, error: expect.stringContaining("is full, so passes can't be sold") });
    expect(await buy(first.id, email("mixed"), [{ ticketTypeId: pass.id, quantity: 1 }, { ticketTypeId: single.id, quantity: 1 }])).toEqual({ ok: false, error: "Buy passes and single dates in separate orders." });
  });

  it("applies the series promo codes to passes", async () => {
    const { series, first, pass } = await createSeries();
    await prisma.promoCode.create({ data: { eventSeriesId: series.id, codeDigest: promoCodeDigest(`PASS-${suffix}`), hint: promoCodeHint(`PASS-${suffix}`), kind: "PERCENT", percentOff: 50, ticketTypeId: pass.id } });
    await buy(first.id, email("promo"), [{ ticketTypeId: pass.id, quantity: 1 }], `PASS-${suffix}`);
    expect(await orderBy(email("promo"))).toMatchObject({ subtotalMinor: BigInt(60000), discountMinor: BigInt(30000), totalMinor: BigInt(30000) });
  });

  it("settles a late payment on a date whose seats are still free", async () => {
    const { first, single } = await createSeries({ capacity: 3 });
    await buy(first.id, email("late"), [{ ticketTypeId: single.id, quantity: 1 }]);
    const order = await orderBy(email("late"));
    const past = new Date(Date.now() - 60_000);
    await prisma.order.update({ where: { id: order.id }, data: { holdExpiresAt: past, holdCapAt: past } });
    await prisma.rSVP.updateMany({ where: { orderId: order.id }, data: { holdExpiresAt: past } });
    const page = [...fake.pages.values()].find((candidate) => candidate.id === order.payments[0]!.attempts[0]!.externalId)!;
    const paymentId = fake.pay(page.id);
    const result = await prisma.$transaction((tx) => settlePaidNotification(tx, { organisationId, provider: "RAZORPAY" }, { checkoutId: page.id, reference: page.reference, paymentId, amountMinor: BigInt(page.amount), currency: "INR" }));
    expect(result.outcome).toBe("confirmed");
  });

  it("keeps a ticket on its own series", async () => {
    const one = await createSeries();
    const other = await createSeries();
    await expect(prisma.rSVP.create({ data: { eventInstanceId: other.first.id, attendeeKey: `guest:${email("cross")}`, guestEmail: email("cross"), status: RsvpStatus.CONFIRMED, ticketTypeId: one.single.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(prisma.ticketType.update({ where: { id: one.single.id }, data: { kind: TicketTypeKind.PASS } })).rejects.toThrow(/fixed/);
  });

  it("cancels a date: its orders are refunded in full, passes their share, and free places go", async () => {
    const { series, first, second, single, pass } = await createSeries({ capacity: 10 });
    await buy(first.id, email("c-date"), [{ ticketTypeId: single.id, quantity: 1 }]);
    await pay(email("c-date"));
    await buy(second.id, email("c-pass"), [{ ticketTypeId: pass.id, quantity: 1 }]);
    await pay(email("c-pass"));
    const held = await buy(first.id, email("c-held"), [{ ticketTypeId: single.id, quantity: 1 }]);
    expect(held).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });

    const result = await cancelOccurrence({ organisationId, seriesId: series.id, instanceId: first.id, actorUserId: actor, reason: "Venue flooded" });
    expect(result).toMatchObject({ refunded: 2, failed: 0, notified: 3 });

    const dateOrder = await orderBy(email("c-date"));
    expect(dateOrder.status).toBe(OrderStatus.CANCELLED);
    expect(dateOrder.payments[0]!.refunds).toEqual([expect.objectContaining({ amountMinor: BigInt(30000), status: expect.stringMatching(/PENDING|SUCCEEDED/) })]);
    expect(dateOrder.rsvps).toHaveLength(0);

    // The pass covered three dates: a third of its price comes back, and it keeps the other two.
    const passOrder = await orderBy(email("c-pass"));
    expect(passOrder.status).toBe(OrderStatus.CONFIRMED);
    expect(passOrder.payments[0]!.refunds.filter((refund) => refund.status !== PaymentRefundStatus.FAILED).map((refund) => refund.amountMinor)).toEqual([BigInt(20000)]);
    expect(passOrder.rsvps.map((rsvp) => rsvp.eventInstanceId)).not.toContain(first.id);
    expect(passOrder.rsvps).toHaveLength(2);

    // The hold ends at once; the scheduler then releases it.
    expect((await orderBy(email("c-held"))).holdExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await prisma.eventInstance.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ cancelledAt: expect.any(Date) });
    expect(await buy(first.id, email("c-after"), [{ ticketTypeId: single.id, quantity: 1 }])).toMatchObject({ ok: false });
    expect(await prisma.outboxMessage.count({ where: { kind: "operator-notice", payload: { path: ["subject"], string_contains: "Cancelled:" } } })).toBeGreaterThanOrEqual(3);

    // Cancelling again changes nothing.
    expect(await cancelOccurrence({ organisationId, seriesId: series.id, instanceId: first.id, actorUserId: actor, reason: "again" })).toMatchObject({ refunded: 0 });
  });
});
