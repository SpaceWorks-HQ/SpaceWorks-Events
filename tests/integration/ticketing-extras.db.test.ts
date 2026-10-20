import { randomUUID } from "node:crypto";
import { EventStatus, MembershipRole, RsvpStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { promoCodeDigest, promoCodeHint } from "@/lib/payments/promo";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { listPublicTicketTypes } from "@/lib/payments/tickets";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
const fake = createFakeProvider();
let organisationId = "";
let orgSlug = "";
let memberId = "";
let previousPaidEvents: boolean | null = null;
let counter = 0;
const email = (name: string) => `${name}-${suffix}@example.test`;

async function createEvent(capacity: number | null = null) {
  counter += 1;
  return prisma.event.create({
    data: {
      organisationId, title: `Extras ${counter}`, slug: `extras-${suffix}-${counter}`, currency: "INR", capacity,
      startDateTime: new Date("2035-01-01T10:00:00.000Z"), endDateTime: new Date("2035-01-01T12:00:00.000Z"), timezone: "UTC",
      status: EventStatus.PUBLISHED, page: { create: { isPublished: true } },
    },
  });
}

type Request = { items: Array<{ ticketTypeId: string; quantity: number; amountMinor?: number; }>; accessCode?: string; addOns?: Array<{ addOnId: string; quantity: number; }>; };
function buyAsGuest(eventSlug: string, who: string, request: Request) {
  return submitRsvpCore({ orgSlug, eventSlug, guestEmail: email(who), name: "Extras Buyer", answers: {}, attendees: [], ...request }, { userId: null });
}

async function orderOf(who: string) {
  return prisma.order.findFirstOrThrow({ where: { buyerEmail: email(who) }, include: { lines: true, rsvps: true }, orderBy: { createdAt: "desc" } });
}

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  const organisation = await prisma.organisation.create({ data: { name: "Extras org", slug: `extras-org-${suffix}` } });
  organisationId = organisation.id;
  orgSlug = organisation.slug;
  memberId = (await prisma.user.create({ data: { name: "Member", email: email("member"), emailVerified: new Date(), memberships: { create: { organisationId, role: MembershipRole.MEMBER } } } })).id;
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
  await prisma.user.deleteMany({ where: { id: memberId } });
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: previousPaidEvents } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe.sequential("ticketing extras", { timeout: 30_000 }, () => {
  it("keeps code-only tickets hidden and unsellable without their code", async () => {
    const event = await createEvent();
    const code = `CREW-${suffix.slice(0, 6)}`.toUpperCase();
    const crew = await prisma.ticketType.create({ data: { eventId: event.id, name: "Crew", priceMinor: BigInt(0), visibility: "CODE", accessCodeDigest: promoCodeDigest(code), accessCodeHint: promoCodeHint(code) } });
    expect(await listPublicTicketTypes({ eventId: event.id }, "INR")).toEqual([]);
    expect((await listPublicTicketTypes({ eventId: event.id }, "INR", new Date(), { accessCode: code })).map((ticket) => ticket.id)).toEqual([crew.id]);
    expect(await buyAsGuest(event.slug, "nocode", { items: [{ ticketTypeId: crew.id, quantity: 1 }] })).toEqual({ ok: false, error: "That ticket needs a valid access code." });
    expect(await buyAsGuest(event.slug, "wrongcode", { items: [{ ticketTypeId: crew.id, quantity: 1 }], accessCode: "WRONG-CODE" })).toEqual({ ok: false, error: "That ticket needs a valid access code." });
    expect(await buyAsGuest(event.slug, "withcode", { items: [{ ticketTypeId: crew.id, quantity: 1 }], accessCode: code.toLowerCase() })).toMatchObject({ ok: true, data: { status: RsvpStatus.CONFIRMED } });
  });

  it("sells members-only tickets to signed-in members alone", async () => {
    const event = await createEvent();
    const members = await prisma.ticketType.create({ data: { eventId: event.id, name: "Members", priceMinor: BigInt(0), visibility: "MEMBERS" } });
    expect(await listPublicTicketTypes({ eventId: event.id }, "INR")).toEqual([]);
    expect(await listPublicTicketTypes({ eventId: event.id }, "INR", new Date(), { member: true })).toHaveLength(1);
    expect(await buyAsGuest(event.slug, "outsider", { items: [{ ticketTypeId: members.id, quantity: 1 }] })).toMatchObject({ ok: false, error: expect.stringContaining("for members of the organisation") });
    expect(await submitRsvpCore({ orgSlug, eventSlug: event.slug, answers: {}, items: [{ ticketTypeId: members.id, quantity: 1 }], attendees: [] }, { userId: memberId })).toMatchObject({ ok: true, data: { status: RsvpStatus.CONFIRMED } });
  });

  it("charges the amount a buyer chose for pay-what-you-want tickets, never below the minimum", async () => {
    const event = await createEvent();
    const flexible = await prisma.ticketType.create({ data: { eventId: event.id, name: "Supporter", priceMinor: BigInt(10000), pricing: "FLEXIBLE", suggestedMinor: BigInt(50000), maxPriceMinor: BigInt(500000) } });
    expect(await buyAsGuest(event.slug, "cheap", { items: [{ ticketTypeId: flexible.id, quantity: 1, amountMinor: 5000 }] })).toMatchObject({ ok: false, error: expect.stringContaining("least you can pay") });
    expect(await buyAsGuest(event.slug, "generous", { items: [{ ticketTypeId: flexible.id, quantity: 2, amountMinor: 75000 }] })).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    expect(await orderOf("generous")).toMatchObject({ totalMinor: BigInt(150000), lines: [expect.objectContaining({ unitMinor: BigInt(75000), quantity: 2 })] });
  });

  it("seats a group ticket's people, counting its limit in tickets and the event's in people", async () => {
    const event = await createEvent(6);
    const team = await prisma.ticketType.create({ data: { eventId: event.id, name: "Team of 4", priceMinor: BigInt(100000), seatsPerTicket: 4, capacity: 2 } });
    expect(await buyAsGuest(event.slug, "team-a", { items: [{ ticketTypeId: team.id, quantity: 1 }] })).toMatchObject({ ok: true });
    const order = await orderOf("team-a");
    expect(order.rsvps).toHaveLength(4);
    expect(order.totalMinor).toBe(BigInt(100000));
    // Two places left on the event: a second team doesn't fit.
    expect(await buyAsGuest(event.slug, "team-b", { items: [{ ticketTypeId: team.id, quantity: 1 }] })).toEqual({ ok: false, error: "Only 2 places left." });
    expect((await listPublicTicketTypes({ eventId: event.id }, "INR"))[0]).toMatchObject({ seatsPerTicket: 4, remaining: 1 });
  });

  it("adds the booking fee per ticket and sells extras within their limit", async () => {
    const event = await createEvent();
    const general = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(49900), feeMinor: BigInt(2000) } });
    const shirt = await prisma.addOn.create({ data: { eventId: event.id, name: "T-shirt", priceMinor: BigInt(30000), capacity: 1, maxPerOrder: 2 } });
    expect(await buyAsGuest(event.slug, "fees", { items: [{ ticketTypeId: general.id, quantity: 2 }], addOns: [{ addOnId: shirt.id, quantity: 1 }] })).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    const order = await orderOf("fees");
    expect(order.totalMinor).toBe(BigInt(49900 * 2 + 2000 * 2 + 30000));
    expect(order.lines.map((line) => [line.kind, line.totalMinor]).sort()).toEqual([["ADD_ON", BigInt(30000)], ["FEE", BigInt(4000)], ["TICKET", BigInt(99800)]].sort());
    expect(order.rsvps).toHaveLength(2);
    expect(await buyAsGuest(event.slug, "fees-b", { items: [{ ticketTypeId: general.id, quantity: 1 }], addOns: [{ addOnId: shirt.id, quantity: 1 }] })).toEqual({ ok: false, error: "T-shirt is sold out." });
  });
});
