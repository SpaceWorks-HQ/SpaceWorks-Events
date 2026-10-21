import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, OrderStatus, PaymentStatus, RsvpStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Re-accepting a declined paid request goes back through the payment flow:
 * it is offered its seats (held, with a payment link) or waitlisted, and is
 * never confirmed without payment.
 */

const signedIn = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (signedIn.id ? { user: { id: signedIn.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { rejectRsvp, reacceptRsvp } from "@/app/actions/rsvp-lifecycle";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "");
const HOUR = 3_600_000;
const fake = createFakeProvider();
let organisationId = "";
let orgSlug = "";
let organiserId = "";
let previousPaidEvents: boolean | null = null;
let counter = 0;

async function paidEvent(capacity: number | null) {
  counter += 1;
  const start = new Date(Date.now() + 30 * 24 * HOUR);
  const event = await prisma.event.create({ data: {
    organisationId, title: `Re-accept paid ${counter}`, slug: `reaccept-paid-${suffix}-${counter}`, currency: "INR",
    startDateTime: start, endDateTime: new Date(start.getTime() + 2 * HOUR), timezone: "UTC", capacity,
    status: EventStatus.PUBLISHED, privacyType: EventPrivacyType.APPROVAL_REQUIRED, page: { create: { isPublished: true } },
  } });
  const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(49900) } });
  return { event, ticket };
}

/** A paid request on `event`, declined by the organiser. Returns its RSVP. */
async function declinedRequest(event: { id: string; slug: string; }, ticketTypeId: string, name: string) {
  const result = await submitRsvpCore({ orgSlug, eventSlug: event.slug, guestEmail: `${name}-${suffix}@example.test`, name, answers: {}, items: [{ ticketTypeId, quantity: 1 }] }, { userId: null });
  expect(result).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_APPROVAL } });
  const rsvp = await prisma.rSVP.findFirstOrThrow({ where: { eventId: event.id, guestName: name } });
  signedIn.id = organiserId;
  expect(await rejectRsvp({ organisationSlug: orgSlug, eventId: event.id, rsvpId: rsvp.id })).toEqual({ ok: true });
  return rsvp;
}

const orderOf = (rsvpId: string) => prisma.rSVP.findUniqueOrThrow({ where: { id: rsvpId }, select: { status: true, order: { select: { id: true, status: true, payments: { select: { status: true } } } } } });

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  const organisation = await prisma.organisation.create({ data: { name: "Re-accept paid org", slug: `reaccept-paid-org-${suffix}` } });
  organisationId = organisation.id;
  orgSlug = organisation.slug;
  organiserId = (await prisma.user.create({ data: { email: `reaccept-owner-${suffix}@example.test`, name: "Organiser" } })).id;
  await prisma.membership.create({ data: { organisationId, userId: organiserId, role: "OWNER" } });
  await prisma.organisationPaymentSettings.create({ data: {
    organisationId, provider: "RAZORPAY", webhookPathId: newWebhookPathId(), razorpayKeyId: "rzp_test_abcdef",
    razorpayKeySecretEncrypted: encryptPaymentSecret(organisationId, "razorpayKeySecretEncrypted", "secretvalue"),
    razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "razorpayWebhookSecretEncrypted", `rzp-webhook-${suffix}`),
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

describe.sequential("re-accepting a declined paid request", () => {
  it("offers the seats with a payment link instead of confirming", async () => {
    const { event, ticket } = await paidEvent(5);
    const rsvp = await declinedRequest(event, ticket.id, "Offered");
    expect((await orderOf(rsvp.id)).order?.status).toBe(OrderStatus.CANCELLED);

    expect(await reacceptRsvp({ organisationSlug: orgSlug, eventId: event.id, rsvpId: rsvp.id })).toEqual({ ok: true, data: { status: "PAYMENT_REQUESTED" } });
    const after = await orderOf(rsvp.id);
    expect(after.status).toBe(RsvpStatus.PENDING_PAYMENT);
    expect(after.order).toMatchObject({ status: OrderStatus.PENDING, payments: [{ status: PaymentStatus.PENDING }] });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: after.order!.id } });
    expect(await prisma.outboxMessage.count({ where: { kind: "payment-notice", payload: { path: ["paymentId"], equals: payment.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { organisationId, action: "ORDER_REACCEPTED", targetId: after.order!.id } })).toBe(1);
    // It's no longer declined, so it can't be re-accepted twice.
    expect(await reacceptRsvp({ organisationSlug: orgSlug, eventId: event.id, rsvpId: rsvp.id })).toMatchObject({ ok: false });
  });

  it("waitlists the request again when the event is full, still unconfirmed and unpaid", async () => {
    const { event, ticket } = await paidEvent(1);
    const rsvp = await declinedRequest(event, ticket.id, "Waiting");
    // Someone else now holds the only place.
    await prisma.rSVP.create({ data: { eventId: event.id, attendeeKey: `guest:taken-${suffix}@example.test`, guestEmail: `taken-${suffix}@example.test`, guestName: "Taken", status: RsvpStatus.CONFIRMED } });

    expect(await reacceptRsvp({ organisationSlug: orgSlug, eventId: event.id, rsvpId: rsvp.id })).toEqual({ ok: true, data: { status: "WAITLISTED" } });
    const after = await orderOf(rsvp.id);
    expect(after.status).toBe(RsvpStatus.WAITLISTED);
    expect(after.order).toMatchObject({ status: OrderStatus.REQUESTED, payments: [] });
  });

  it("refuses an order that isn't a declined request", async () => {
    const { event, ticket } = await paidEvent(5);
    const rsvp = await declinedRequest(event, ticket.id, "Tampered");
    // Only an order a decline cancelled may be reopened; any other state is refused.
    const { order } = await orderOf(rsvp.id);
    await prisma.order.update({ where: { id: order!.id }, data: { status: OrderStatus.CONFIRMED } });
    expect(await reacceptRsvp({ organisationSlug: orgSlug, eventId: event.id, rsvpId: rsvp.id })).toEqual({ ok: false, error: "Only a declined request can be re-accepted." });
    expect((await orderOf(rsvp.id)).status).toBe(RsvpStatus.REJECTED);
  });
});
