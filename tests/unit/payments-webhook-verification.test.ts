import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRazorpayWebhook } from "@/lib/payments/providers/razorpay";
import { verifyStripeWebhook } from "@/lib/payments/providers/stripe";
import { WebhookVerificationError } from "@/lib/payments/providers/types";

const RAZORPAY_SECRET = "razorpay-webhook-secret";
const STRIPE_SECRET = "whsec_testsecretvalue123";

function razorpayRequest(body: unknown, options: { secret?: string; eventId?: string | null; signature?: string; } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = options.signature ?? crypto.createHmac("sha256", options.secret ?? RAZORPAY_SECRET).update(raw).digest("hex");
  const headers = new Headers({ "x-razorpay-signature": signature });
  if (options.eventId !== null) headers.set("x-razorpay-event-id", options.eventId ?? "evt_rzp_1");
  return { raw, headers };
}

function stripeRequest(body: unknown, options: { secret?: string; timestamp?: number; } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", options.secret ?? STRIPE_SECRET).update(`${timestamp}.`).update(raw).digest("hex");
  return { raw, headers: new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` }) };
}

const linkPaid = {
  event: "payment_link.paid",
  payload: {
    payment_link: { entity: { id: "plink_123", reference_id: "pay_ref_1", notes: { attempt_id: "pay_ref_1" } } },
    payment: { entity: { id: "pay_ABC", amount: 49900, currency: "INR", status: "captured" } },
  },
};

describe("Razorpay webhook verification", () => {
  it("accepts a correctly signed payment_link.paid and normalises it", () => {
    const { raw, headers } = razorpayRequest(linkPaid);
    expect(verifyRazorpayWebhook(RAZORPAY_SECRET, raw, headers)).toEqual({
      eventId: "evt_rzp_1",
      eventType: "payment_link.paid",
      paid: { checkoutId: "plink_123", reference: "pay_ref_1", paymentId: "pay_ABC", amountMinor: BigInt(49900), currency: "INR" },
      refunds: [],
      closedCheckoutId: null,
      dispute: null,
    });
  });

  it("reports an expired or cancelled link", () => {
    const { raw, headers } = razorpayRequest({ event: "payment_link.expired", payload: { payment_link: { entity: { id: "plink_9", status: "expired" } } } });
    expect(verifyRazorpayWebhook(RAZORPAY_SECRET, raw, headers)).toMatchObject({ paid: null, closedCheckoutId: "plink_9" });
  });

  it("rejects a wrong secret, a missing signature, and a tampered body", () => {
    const { raw, headers } = razorpayRequest(linkPaid, { secret: "another-organisations-secret" });
    expect(() => verifyRazorpayWebhook(RAZORPAY_SECRET, raw, headers)).toThrow(WebhookVerificationError);
    expect(() => verifyRazorpayWebhook(RAZORPAY_SECRET, raw, new Headers())).toThrow(WebhookVerificationError);
    const signed = razorpayRequest(linkPaid);
    const tampered = Buffer.from(signed.raw.toString().replace("49900", "1"));
    expect(() => verifyRazorpayWebhook(RAZORPAY_SECRET, tampered, signed.headers)).toThrow(WebhookVerificationError);
    expect(() => verifyRazorpayWebhook(RAZORPAY_SECRET, signed.raw, new Headers({ "x-razorpay-signature": "é".repeat(64) }))).toThrow(WebhookVerificationError);
  });

  it("never treats payment.authorized as paid", () => {
    const { raw, headers } = razorpayRequest({ event: "payment.authorized", payload: { payment: { entity: { id: "pay_ABC", amount: 49900, currency: "INR", status: "authorized" } } } });
    expect(verifyRazorpayWebhook(RAZORPAY_SECRET, raw, headers).paid).toBeNull();
  });

  it("normalises refund events and falls back to entity ids without the event header", () => {
    const { raw, headers } = razorpayRequest({
      event: "refund.processed",
      created_at: 1700000000,
      payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_ABC", amount: 1000, status: "processed", notes: { refund_id: "ref_local" } } } },
    }, { eventId: null });
    const event = verifyRazorpayWebhook(RAZORPAY_SECRET, raw, headers);
    expect(event.eventId).toBe("refund.processed:rfnd_1:1700000000");
    expect(event.refunds).toEqual([{ refundId: "rfnd_1", paymentId: "pay_ABC", reference: "ref_local", state: "SUCCEEDED", amountMinor: BigInt(1000) }]);
  });
});

describe("Stripe webhook verification", () => {
  const completed = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", payment_status: "paid", payment_intent: "pi_1", amount_total: 50000, currency: "inr", client_reference_id: "pay_ref_2" } },
  };

  it("accepts a correctly signed paid session and normalises it", () => {
    const { raw, headers } = stripeRequest(completed);
    expect(verifyStripeWebhook(STRIPE_SECRET, raw, headers)).toEqual({
      eventId: "evt_1",
      eventType: "checkout.session.completed",
      paid: { checkoutId: "cs_test_1", reference: "pay_ref_2", paymentId: "pi_1", amountMinor: BigInt(50000), currency: "INR" },
      refunds: [],
      closedCheckoutId: null,
      dispute: null,
    });
  });

  it("reports an expired Checkout Session", () => {
    const { raw, headers } = stripeRequest({ id: "evt_x", type: "checkout.session.expired", data: { object: { id: "cs_test_9", status: "expired" } } });
    expect(verifyStripeWebhook(STRIPE_SECRET, raw, headers)).toMatchObject({ paid: null, closedCheckoutId: "cs_test_9" });
  });

  it("does not count a completed but unpaid session", () => {
    const { raw, headers } = stripeRequest({ ...completed, data: { object: { ...completed.data.object, payment_status: "unpaid" } } });
    expect(verifyStripeWebhook(STRIPE_SECRET, raw, headers).paid).toBeNull();
  });

  it("counts a delayed payment once it succeeds", () => {
    const { raw, headers } = stripeRequest({ ...completed, type: "checkout.session.async_payment_succeeded" });
    expect(verifyStripeWebhook(STRIPE_SECRET, raw, headers).paid?.paymentId).toBe("pi_1");
  });

  it("rejects a stale timestamp, a wrong secret and an unsigned request", () => {
    const stale = stripeRequest(completed, { timestamp: Math.floor(Date.now() / 1000) - 301 });
    expect(() => verifyStripeWebhook(STRIPE_SECRET, stale.raw, stale.headers)).toThrow(WebhookVerificationError);
    const wrong = stripeRequest(completed, { secret: "whsec_someoneelse000000" });
    expect(() => verifyStripeWebhook(STRIPE_SECRET, wrong.raw, wrong.headers)).toThrow(WebhookVerificationError);
    expect(() => verifyStripeWebhook(STRIPE_SECRET, wrong.raw, new Headers())).toThrow(WebhookVerificationError);
  });

  it("accepts any listed v1 signature during secret rotation", () => {
    const { raw, headers } = stripeRequest(completed);
    headers.set("stripe-signature", `${headers.get("stripe-signature")!.replace("v1=", "v1=deadbeef,v1=")}`);
    expect(verifyStripeWebhook(STRIPE_SECRET, raw, headers).eventId).toBe("evt_1");
  });

  it("normalises refund updates", () => {
    const { raw, headers } = stripeRequest({ id: "evt_2", type: "refund.updated", data: { object: { id: "re_1", payment_intent: "pi_1", amount: 2500, status: "succeeded", metadata: { refund_id: "ref_local" } } } });
    expect(verifyStripeWebhook(STRIPE_SECRET, raw, headers).refunds).toEqual([{ refundId: "re_1", paymentId: "pi_1", reference: "ref_local", state: "SUCCEEDED", amountMinor: BigInt(2500) }]);
  });
});
