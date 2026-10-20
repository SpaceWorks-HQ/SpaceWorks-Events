import { randomUUID } from "node:crypto";
import { EventPermission, EventPrivacyType, EventStatus, MembershipRole, OrderStatus, RsvpStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { savePaymentSettings } from "@/app/actions/payment-settings";
import { saveTicketType } from "@/app/actions/ticket-types";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
const fake = createFakeProvider();
const host = { id: "", slug: `host-${suffix}` };
const partner = { id: "", slug: `partner-${suffix}` };
const users = { collaborator: "", buyer: "" };
let previousPaidEvents: boolean | null = null;
let counter = 0;

/** The host takes Razorpay; the collaborator's own organisation takes Stripe, so the provider shows whose account was used. */
async function connect(organisationId: string, provider: "RAZORPAY" | "STRIPE") {
  await prisma.organisationPaymentSettings.create({ data: {
    organisationId, provider, webhookPathId: newWebhookPathId(),
    ...(provider === "RAZORPAY"
      ? {
        razorpayKeyId: "rzp_test_abcdef",
        razorpayKeySecretEncrypted: encryptPaymentSecret(organisationId, "razorpayKeySecretEncrypted", "secretvalue"),
        razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "razorpayWebhookSecretEncrypted", `rzp-webhook-${suffix}`),
      }
      : {
        stripeSecretKeyEncrypted: encryptPaymentSecret(organisationId, "stripeSecretKeyEncrypted", "sk_test_abcdefghijkl"),
        stripeWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "stripeWebhookSecretEncrypted", `whsec_${suffix}`),
        stripeTestMode: true,
      }),
  } });
}

async function createEvent(privacyType: EventPrivacyType) {
  counter += 1;
  return prisma.event.create({
    data: {
      organisationId: host.id, title: `Host event ${counter}`, slug: `host-${suffix}-${counter}`, currency: "INR",
      startDateTime: new Date("2035-01-01T10:00:00.000Z"), endDateTime: new Date("2035-01-01T12:00:00.000Z"), timezone: "UTC",
      status: EventStatus.PUBLISHED, privacyType, page: { create: { isPublished: true } },
    },
  });
}

async function orderFor(eventId: string) {
  return prisma.order.findFirstOrThrow({ where: { eventId }, include: { payments: { include: { attempts: true } }, rsvps: true }, orderBy: { createdAt: "desc" } });
}

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  host.id = (await prisma.organisation.create({ data: { name: "Host org", slug: host.slug } })).id;
  partner.id = (await prisma.organisation.create({ data: { name: "Partner org", slug: partner.slug } })).id;
  for (const key of Object.keys(users) as Array<keyof typeof users>) {
    users[key] = (await prisma.user.create({ data: { name: key, email: `${key}-${suffix}@example.test`, emailVerified: new Date() } })).id;
  }
  // The collaborator owns the partner organisation and is a plain co-organiser of the host's events.
  await prisma.membership.create({ data: { userId: users.collaborator, organisationId: partner.id, role: MembershipRole.OWNER } });
  await connect(host.id, "RAZORPAY");
  await connect(partner.id, "STRIPE");
  previousPaidEvents = (await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID } }))?.paidEventsEnabled ?? null;
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, paidEventsEnabled: true }, update: { paidEventsEnabled: true } });
});

afterAll(async () => {
  identity.id = "";
  await prisma.organisation.deleteMany({ where: { id: { in: [host.id, partner.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: previousPaidEvents } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe.sequential("the host organisation receives the money", { timeout: 30_000 }, () => {
  it("lets a co-organiser from another organisation price tickets, never touch payments, and pays the host's account", async () => {
    const event = await createEvent(EventPrivacyType.PUBLIC);
    await prisma.eventCollaborator.create({ data: { eventId: event.id, userId: users.collaborator, permissions: [EventPermission.EDIT_DETAILS] } });
    identity.id = users.collaborator;

    const saved = await saveTicketType({ organisationSlug: host.slug, eventId: event.id, name: "Standard", price: "499" });
    expect(saved).toMatchObject({ ok: true });
    expect(await savePaymentSettings({ organisationSlug: host.slug, provider: "STRIPE", currency: "INR" })).toEqual({ ok: false, error: "Only the organisation owner can manage payments." });
    // Their own organisation's account plays no part in the host's event.
    expect(await saveTicketType({ organisationSlug: partner.slug, eventId: event.id, name: "Elsewhere", price: "499" })).toMatchObject({ ok: false });

    identity.id = "";
    const ticketTypeId = saved.ok ? saved.data!.id : "";
    const result = await submitRsvpCore({ orgSlug: host.slug, eventSlug: event.slug, guestEmail: `guest-${suffix}@example.test`, name: "Guest", answers: {}, items: [{ ticketTypeId, quantity: 1 }], attendees: [] }, { userId: null });
    expect(result).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT, checkoutUrl: expect.stringContaining("rzp.example") } });
    const order = await orderFor(event.id);
    expect(order.organisationId).toBe(host.id);
    expect(order.payments).toEqual([expect.objectContaining({ organisationId: host.id, provider: "RAZORPAY", amountMinor: BigInt(49900) })]);
  });

  it("sells paid tickets on hidden-link events like public ones", async () => {
    const event = await createEvent(EventPrivacyType.HIDDEN_LINK);
    const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(29900) } });
    const result = await submitRsvpCore({ orgSlug: host.slug, eventSlug: event.slug, guestEmail: `hidden-${suffix}@example.test`, name: "Guest", answers: {}, items: [{ ticketTypeId: ticket.id, quantity: 1 }], attendees: [] }, { userId: null });
    expect(result).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    expect(await orderFor(event.id)).toMatchObject({ status: OrderStatus.PENDING, payments: [expect.objectContaining({ organisationId: host.id })] });
  });

  it("sells paid tickets on invite-only events to the invited account only", async () => {
    const event = await createEvent(EventPrivacyType.INVITE_ONLY);
    const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(29900) } });
    const input = { orgSlug: host.slug, eventSlug: event.slug, answers: {}, items: [{ ticketTypeId: ticket.id, quantity: 1 }], attendees: [] };
    expect(await submitRsvpCore({ ...input, guestEmail: `buyer-${suffix}@example.test`, name: "Guest" }, { userId: null })).toMatchObject({ ok: false });
    expect(await submitRsvpCore(input, { userId: users.buyer })).toMatchObject({ ok: false, error: expect.stringContaining("invite-only") });
    expect(await prisma.order.count({ where: { eventId: event.id } })).toBe(0);

    await prisma.eventInvite.create({ data: { eventId: event.id, email: `buyer-${suffix}@example.test` } });
    expect(await submitRsvpCore(input, { userId: users.buyer })).toMatchObject({ ok: true, data: { status: RsvpStatus.PENDING_PAYMENT } });
    const order = await orderFor(event.id);
    expect(order.payments).toEqual([expect.objectContaining({ organisationId: host.id, provider: "RAZORPAY" })]);
    expect(order.rsvps[0]!.userId).toBe(users.buyer);
  });
});
