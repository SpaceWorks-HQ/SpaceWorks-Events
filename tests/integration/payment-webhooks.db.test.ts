import crypto, { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { newWebhookPathId } from "@/lib/payments/settings";
import { handleProviderWebhook } from "@/lib/payments/webhooks";

const suffix = randomUUID().replace(/-/g, "");
const RAZORPAY_SECRET_A = `rzp-webhook-a-${suffix}`;
const RAZORPAY_SECRET_B = `rzp-webhook-b-${suffix}`;
const STRIPE_SECRET_A = `whsec_${suffix}`;
let organisationA = "";
let organisationB = "";
const pathA = newWebhookPathId();
const pathB = newWebhookPathId();

function razorpay(path: string, body: unknown, secret: string, eventId: string) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return new Request(`http://localhost/api/webhooks/razorpay/${path}`, {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
  });
}

function stripe(path: string, body: unknown, secret: string) {
  const raw = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return new Request(`http://localhost/api/webhooks/stripe/${path}`, {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
  });
}

const paidBody = { event: "payment_link.paid", payload: { payment: { entity: { id: "pay_1", amount: 100, currency: "INR", status: "captured" } } } };

describe.sequential("payment webhooks", () => {
  beforeAll(async () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString("base64"));
    const [a, b] = await Promise.all([
      prisma.organisation.create({ data: { name: "Webhook tenant A", slug: `webhook-a-${suffix}` } }),
      prisma.organisation.create({ data: { name: "Webhook tenant B", slug: `webhook-b-${suffix}` } }),
    ]);
    organisationA = a.id;
    organisationB = b.id;
    await prisma.organisationPaymentSettings.create({ data: {
      organisationId: organisationA,
      provider: "RAZORPAY",
      webhookPathId: pathA,
      razorpayKeyId: "rzp_test_abcdef",
      razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationA, "razorpayWebhookSecretEncrypted", RAZORPAY_SECRET_A),
      stripeWebhookSecretEncrypted: encryptPaymentSecret(organisationA, "stripeWebhookSecretEncrypted", STRIPE_SECRET_A),
    } });
    await prisma.organisationPaymentSettings.create({ data: {
      organisationId: organisationB,
      provider: "RAZORPAY",
      webhookPathId: pathB,
      razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationB, "razorpayWebhookSecretEncrypted", RAZORPAY_SECRET_B),
    } });
  });

  afterAll(async () => {
    await prisma.organisation.deleteMany({ where: { id: { in: [organisationA, organisationB].filter(Boolean) } } });
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("records a verified event once and acknowledges replays", async () => {
    const first = await handleProviderWebhook(razorpay(pathA, paidBody, RAZORPAY_SECRET_A, `evt-${suffix}`), "RAZORPAY", pathA);
    expect(first.status).toBe(200);
    const replay = await handleProviderWebhook(razorpay(pathA, paidBody, RAZORPAY_SECRET_A, `evt-${suffix}`), "RAZORPAY", pathA);
    expect(replay.status).toBe(200);
    const rows = await prisma.processedWebhookEvent.findMany({ where: { organisationId: organisationA } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "RAZORPAY", eventId: `evt-${suffix}`, eventType: "payment_link.paid" });
  });

  it("verifies with the addressed organisation's own secret only", async () => {
    // Organisation B's valid signature, sent to organisation A's address.
    const crossTenant = await handleProviderWebhook(razorpay(pathA, paidBody, RAZORPAY_SECRET_B, `evt-cross-${suffix}`), "RAZORPAY", pathA);
    expect(crossTenant.status).toBe(400);
    expect(await crossTenant.text()).toBe("");
    const own = await handleProviderWebhook(razorpay(pathB, paidBody, RAZORPAY_SECRET_B, `evt-cross-${suffix}`), "RAZORPAY", pathB);
    expect(own.status).toBe(200);
    expect(await prisma.processedWebhookEvent.count({ where: { eventId: `evt-cross-${suffix}` } })).toBe(1);
    expect(await prisma.processedWebhookEvent.count({ where: { eventId: `evt-cross-${suffix}`, organisationId: organisationB } })).toBe(1);
  });

  it("answers unknown or malformed addresses and providers without a secret with 404", async () => {
    expect((await handleProviderWebhook(razorpay("short", paidBody, RAZORPAY_SECRET_A, "x"), "RAZORPAY", "short")).status).toBe(404);
    const unknown = newWebhookPathId();
    expect((await handleProviderWebhook(razorpay(unknown, paidBody, RAZORPAY_SECRET_A, "x"), "RAZORPAY", unknown)).status).toBe(404);
    // Organisation B has no Stripe signing secret.
    expect((await handleProviderWebhook(stripe(pathB, { id: "evt_s", type: "x" }, STRIPE_SECRET_A), "STRIPE", pathB)).status).toBe(404);
  });

  it("verifies Stripe deliveries separately from Razorpay ones", async () => {
    const response = await handleProviderWebhook(stripe(pathA, { id: `evt_stripe_${suffix}`, type: "checkout.session.expired", data: { object: {} } }, STRIPE_SECRET_A), "STRIPE", pathA);
    expect(response.status).toBe(200);
    expect(await prisma.processedWebhookEvent.findFirst({ where: { organisationId: organisationA, provider: "STRIPE" } })).toMatchObject({ eventId: `evt_stripe_${suffix}` });
  });

  it("rolls back the idempotency record when applying the event fails", async () => {
    const response = await handleProviderWebhook(razorpay(pathA, paidBody, RAZORPAY_SECRET_A, `evt-fail-${suffix}`), "RAZORPAY", pathA, async () => {
      throw new Error("settlement failed");
    });
    expect(response.status).toBe(500);
    expect(await prisma.processedWebhookEvent.count({ where: { eventId: `evt-fail-${suffix}` } })).toBe(0);
  });

  it("refuses oversized bodies before verifying", async () => {
    const big = new Request(`http://localhost/api/webhooks/razorpay/${pathA}`, { method: "POST", body: "x".repeat(300 * 1024) });
    expect((await handleProviderWebhook(big, "RAZORPAY", pathA)).status).toBe(413);
  });

  it("enforces provider and path shape constraints in the database", async () => {
    await expect(prisma.organisationPaymentSettings.update({ where: { organisationId: organisationB }, data: { provider: "OFFLINE" } })).rejects.toThrow();
    await expect(prisma.organisationPaymentSettings.update({ where: { organisationId: organisationB }, data: { currency: "inr" } })).rejects.toThrow();
    await expect(prisma.organisationPaymentSettings.update({ where: { organisationId: organisationB }, data: { webhookPathId: "short" } })).rejects.toThrow();
  });
});
