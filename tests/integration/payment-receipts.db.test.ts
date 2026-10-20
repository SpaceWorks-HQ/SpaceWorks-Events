import { randomUUID } from "node:crypto";
import { EventStatus, MembershipRole, OrderStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { GET as downloadReceipt } from "@/app/api/orders/[token]/receipt/route";
import { saveReceiptDetails } from "@/app/actions/payment-settings";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { refundOrder } from "@/lib/payments/operations";
import { createReceiptPdf, loadReceipt } from "@/lib/payments/receipts";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { handleProviderWebhook, settleWebhookEvent } from "@/lib/payments/webhooks";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { createFakeProvider, FAKE_PROVIDER_ORIGIN, signedPaidWebhook } from "../helpers/fakeProviderFetch";

const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
const SECRETS = { RAZORPAY: `rzp-webhook-${suffix}`, STRIPE: `whsec_${suffix}` } as const;
const pathId = newWebhookPathId();
const fake = createFakeProvider();
const users = { owner: "", admin: "" };
let organisationId = "";
let orgSlug = "";
let previousPaidEvents: boolean | null = null;
let counter = 0;

async function paidOrder(provider: "RAZORPAY" | "STRIPE") {
  await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider } });
  counter += 1;
  const event = await prisma.event.create({
    data: {
      organisationId, title: `Receipt event ${counter}`, slug: `receipt-${suffix}-${counter}`, currency: "INR",
      startDateTime: new Date("2035-01-01T10:00:00.000Z"), endDateTime: new Date("2035-01-01T12:00:00.000Z"), timezone: "Asia/Kolkata",
      status: EventStatus.PUBLISHED, page: { create: { isPublished: true } },
    },
  });
  const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(49900) } });
  await submitRsvpCore({ orgSlug, eventSlug: event.slug, guestEmail: `buyer-${counter}-${suffix}@example.test`, name: "Receipt Buyer", answers: {}, items: [{ ticketTypeId: ticket.id, quantity: 2 }], attendees: [] }, { userId: null });
  const order = await prisma.order.findFirstOrThrow({ where: { eventId: event.id }, include: { payments: { include: { attempts: true } } } });
  const page = [...fake.pages.values()].find((candidate) => candidate.id === order.payments[0]!.attempts[0]!.externalId)!;
  fake.pay(page.id);
  const webhook = signedPaidWebhook(fake.pages.get(page.id)!, SECRETS[provider], `/api/webhooks/${provider.toLowerCase()}/${pathId}`);
  expect((await handleProviderWebhook(webhook, provider, pathId, settleWebhookEvent)).status).toBe(200);
  return prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
}

const receiptRequest = (token: string) => downloadReceipt(new Request(`http://127.0.0.1/api/orders/${token}/receipt`), { params: Promise.resolve({ token }) });

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3999");
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", FAKE_PROVIDER_ORIGIN);
  vi.stubGlobal("fetch", fake.fetch);
  const organisation = await prisma.organisation.create({ data: { name: "Receipt Makers", slug: `receipts-${suffix}` } });
  organisationId = organisation.id;
  orgSlug = organisation.slug;
  for (const key of Object.keys(users) as Array<keyof typeof users>) {
    users[key] = (await prisma.user.create({ data: { name: key, email: `${key}-${suffix}@example.test`, emailVerified: new Date() } })).id;
  }
  await prisma.membership.createMany({ data: [
    { userId: users.owner, organisationId, role: MembershipRole.OWNER },
    { userId: users.admin, organisationId, role: MembershipRole.ADMIN },
  ] });
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
  identity.id = "";
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: INSTANCE_SETTINGS_ID }, data: { paidEventsEnabled: previousPaidEvents } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe.sequential("receipts", { timeout: 30_000 }, () => {
  it("lets only the owner set the registered details printed on receipts", async () => {
    const details = { organisationSlug: orgSlug, legalName: "Receipt Makers Foundation", registrationNumber: "U12345KA2026NPL000001", address: "12 Example Road\nBengaluru 560001" };
    identity.id = users.admin;
    expect(await saveReceiptDetails(details)).toEqual({ ok: false, error: "Only the organisation owner can manage payments." });
    identity.id = users.owner;
    expect(await saveReceiptDetails(details)).toEqual({ ok: true });
    identity.id = "";
    expect(await prisma.organisationPaymentSettings.findUniqueOrThrow({ where: { organisationId } })).toMatchObject({ receiptLegalName: "Receipt Makers Foundation", receiptRegistrationNumber: "U12345KA2026NPL000001" });
  });

  it("has no receipt before anything is paid", async () => {
    await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider: "RAZORPAY" } });
    counter += 1;
    const event = await prisma.event.create({
      data: { organisationId, title: "Unpaid", slug: `receipt-${suffix}-${counter}`, currency: "INR", startDateTime: new Date("2035-01-01T10:00:00.000Z"), endDateTime: new Date("2035-01-01T12:00:00.000Z"), timezone: "UTC", status: EventStatus.PUBLISHED, page: { create: { isPublished: true } } },
    });
    const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: "General", priceMinor: BigInt(49900) } });
    await submitRsvpCore({ orgSlug, eventSlug: event.slug, guestEmail: `unpaid-${suffix}@example.test`, name: "Not Yet", answers: {}, items: [{ ticketTypeId: ticket.id, quantity: 1 }], attendees: [] }, { userId: null });
    const order = await prisma.order.findFirstOrThrow({ where: { eventId: event.id } });
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(await loadReceipt(order.accessToken)).toBeNull();
    expect((await receiptRequest(order.accessToken)).status).toBe(404);
    expect((await receiptRequest("not-a-token")).status).toBe(404);
  });

  it.each([
    ["RAZORPAY", "Razorpay", "Visa •••• 4242"],
    ["STRIPE", "Stripe", "UPI ••••@okicici"],
  ] as const)("proves a %s payment with the organisation's details and the provider's payment details", async (provider, name, method) => {
    const order = await paidOrder(provider);
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    const receipt = (await loadReceipt(order.accessToken))!;
    expect(receipt).toMatchObject({
      number: order.reference,
      issuer: { name: "Receipt Makers Foundation", tradingName: "Receipt Makers", registrationNumber: "U12345KA2026NPL000001", address: "12 Example Road\nBengaluru 560001" },
      buyer: { name: "Receipt Buyer" },
      paidMinor: BigInt(99800),
      payments: [{ online: true, provider: name, method, reference: order.payments[0]!.externalPaymentId, amountMinor: BigInt(99800) }],
    });
    // The method is asked once and kept on the payment.
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: order.payments[0]!.id } })).toMatchObject({ methodSummary: method });
    const lookups = fake.requests.filter((request) => /\/v1\/(payments|payment_intents)\/\w+$/.test(request.path.split("?")[0]!)).length;
    await loadReceipt(order.accessToken);
    expect(fake.requests.filter((request) => /\/v1\/(payments|payment_intents)\/\w+$/.test(request.path.split("?")[0]!)).length).toBe(lookups);

    const response = await receiptRequest(order.accessToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="receipt-${order.reference}.pdf"`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("still proves payment after a refund, and lists the refund", async () => {
    const order = await paidOrder("RAZORPAY");
    await refundOrder({ orderId: order.id, organisationId, actorUserId: users.owner, amountMinor: BigInt(20000), reason: "Partial refund", cancelTickets: false });
    const receipt = (await loadReceipt(order.accessToken))!;
    expect(receipt.refundedMinor).toBe(BigInt(20000));
    expect(receipt.payments[0]!.refunds).toEqual([expect.objectContaining({ amountMinor: BigInt(20000) })]);
    // Names in any script still render (as "?" where Helvetica has no glyph).
    const pdf = await createReceiptPdf({ ...receipt, buyer: { name: "प्रिया Sharma", email: "priya@example.test" } });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
