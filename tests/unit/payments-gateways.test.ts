import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentsUnavailable, providerApiRoot } from "@/lib/payments/http";
import { RazorpayGateway } from "@/lib/payments/providers/razorpay";
import { StripeGateway } from "@/lib/payments/providers/stripe";

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const checkout = {
  reference: "payref1",
  amountMinor: BigInt(49900),
  currency: "INR",
  description: "Space Works Meetup: General admission",
  returnUrl: "https://events.example/ticket/token?payment=return",
  cancelUrl: "https://events.example/ticket/token?payment=cancelled",
  expiresAt: new Date(Date.now() + 30 * 60_000),
  customerEmail: "guest@example.test",
  idempotencyKey: "checkout:payref1:1",
};

describe("provider base URL override", () => {
  it("uses the real provider APIs by default", () => {
    expect(providerApiRoot("RAZORPAY")).toBe("https://api.razorpay.com");
    expect(providerApiRoot("STRIPE")).toBe("https://api.stripe.com");
  });

  it("allows a loopback fake outside production", () => {
    vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", "http://127.0.0.1:4010");
    expect(providerApiRoot("STRIPE")).toBe("http://127.0.0.1:4010/stripe");
  });

  it("refuses the override in production and for non-loopback hosts", () => {
    vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", "http://127.0.0.1:4010");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => providerApiRoot("RAZORPAY")).toThrow(/not allowed in production/);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", "http://attacker.example");
    expect(() => providerApiRoot("RAZORPAY")).toThrow(/loopback/);
    vi.stubEnv("PAYMENTS_FAKE_PROVIDER_URL", "https://127.0.0.1:4010/path");
    expect(() => providerApiRoot("RAZORPAY")).toThrow(/loopback/);
  });
});

describe("Razorpay gateway", () => {
  const gateway = new RazorpayGateway("rzp_test_abcdef", "secretvalue");

  it("creates a payment link with integer paise, our reference and its own notifications off", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "plink_1", short_url: "https://rzp.io/i/abc" }));
    await expect(gateway.createCheckout(checkout)).resolves.toEqual({ checkoutId: "plink_1", checkoutUrl: "https://rzp.io/i/abc" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payment_links");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("rzp_test_abcdef:secretvalue").toString("base64")}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ amount: 49900, currency: "INR", reference_id: "payref1", accept_partial: false, notify: { sms: false, email: false }, reminder_enable: false, callback_method: "get" });
    expect(Number.isInteger(body.amount)).toBe(true);
    expect(body.expire_by).toBeGreaterThanOrEqual(Math.floor((Date.now() + 15 * 60_000) / 1000));
  });

  it("reports a paid link when cancelling finds the attendee already paid", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(400, { error: { code: "BAD_REQUEST_ERROR", description: "Payment link already paid" } }))
      .mockResolvedValueOnce(reply(200, { status: "paid", currency: "INR", payments: [{ payment_id: "pay_1", amount: 49900, status: "captured" }] }));
    await expect(gateway.cancelCheckout("plink_1")).resolves.toEqual({ state: "paid", paymentId: "pay_1", amountMinor: BigInt(49900), currency: "INR" });
  });

  it("refuses to interpolate unsafe ids into API paths", async () => {
    await expect(gateway.getCheckoutStatus("../payments")).rejects.toBeInstanceOf(PaymentsUnavailable);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps network failures and never exposes the provider message", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED with secret in message"));
    const error = await gateway.testConnection().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PaymentsUnavailable);
    expect(String((error as Error).message)).not.toContain("secret");
  });

  it("maps refund status", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "rfnd_1", status: "processed" }));
    await expect(gateway.createRefund({ paymentId: "pay_1", amountMinor: BigInt(1000), currency: "INR", reference: "refund1", idempotencyKey: "refund:refund1" }))
      .resolves.toEqual({ refundId: "rfnd_1", state: "SUCCEEDED" });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ amount: 1000, notes: { refund_id: "refund1" } });
  });
});

describe("Stripe gateway", () => {
  const gateway = new StripeGateway("sk_test_abcdefghijkl");

  it("creates a Checkout Session as form data with an idempotency key and a valid expiry", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    await gateway.createCheckout(checkout);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers.Authorization).toBe("Bearer sk_test_abcdefghijkl");
    expect(init.headers["Idempotency-Key"]).toBe("checkout:payref1:1");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("49900");
    expect(form.get("line_items[0][price_data][currency]")).toBe("inr");
    expect(form.get("client_reference_id")).toBe("payref1");
    expect(form.get("metadata[payment_id]")).toBe("payref1");
    // Stripe requires at least 30 minutes; a 30-minute hold is stretched, not rejected.
    expect(Number(form.get("expires_at"))).toBeGreaterThanOrEqual(Math.floor((Date.now() + 30 * 60_000) / 1000));
  });

  it("treats only a complete and paid session as paid", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { status: "complete", payment_status: "unpaid", payment_intent: "pi_1" }));
    await expect(gateway.getCheckoutStatus("cs_test_1")).resolves.toEqual({ state: "open" });
    fetchMock.mockResolvedValueOnce(reply(200, { status: "complete", payment_status: "paid", payment_intent: { id: "pi_1" }, amount_total: 49900, currency: "inr" }));
    await expect(gateway.getCheckoutStatus("cs_test_1")).resolves.toEqual({ state: "paid", paymentId: "pi_1", amountMinor: BigInt(49900), currency: "INR" });
  });

  it("expires an open session and reports closed", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "cs_test_1", status: "expired" }));
    await expect(gateway.cancelCheckout("cs_test_1")).resolves.toEqual({ state: "closed" });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.stripe.com/v1/checkout/sessions/cs_test_1/expire");
  });

  it("surfaces an unknown cancellation outcome instead of guessing", async () => {
    fetchMock.mockResolvedValue(reply(500, {}));
    await expect(gateway.cancelCheckout("cs_test_1")).rejects.toMatchObject({ status: 500 });
  });
});
