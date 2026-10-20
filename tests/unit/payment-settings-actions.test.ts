import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  recent: vi.fn(),
  limited: vi.fn(),
  membership: vi.fn(),
  orgFind: vi.fn(),
  settingsFind: vi.fn(),
  settingsUpsert: vi.fn(),
  settingsUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: mocks.recent }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.limited }));
vi.mock("@/lib/permissions", () => ({ getMembership: mocks.membership }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/payments/providers/razorpay", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/payments/providers/razorpay")>();
  return { ...original, RazorpayGateway: vi.fn(function RazorpayGateway() { return { testConnection: mocks.testConnection }; }) };
});

const tx = {
  organisationPaymentSettings: { upsert: mocks.settingsUpsert, update: mocks.settingsUpdate },
  auditEvent: { create: mocks.auditCreate },
};
vi.mock("@/lib/db", () => ({ prisma: {
  organisation: { findUnique: mocks.orgFind },
  organisationPaymentSettings: { findUnique: mocks.settingsFind, update: mocks.settingsUpdate },
  auditEvent: { create: mocks.auditCreate },
  $transaction: mocks.transaction,
} }));

import { disconnectPaymentProvider, savePaymentSettings, testPaymentConnection } from "@/app/actions/payment-settings";
import { PaymentsUnavailable } from "@/lib/payments/http";
import { encryptPaymentSecret } from "@/lib/payments/secrets";

const razorpay = {
  organisationSlug: "tenant",
  provider: "RAZORPAY",
  currency: "inr",
  razorpayKeyId: "rzp_test_abcdef123",
  razorpayKeySecret: "TopSecretKey123",
  razorpayWebhookSecret: "my-webhook-secret",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MFA_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  mocks.auth.mockResolvedValue({ user: { id: "owner_1" } });
  mocks.recent.mockResolvedValue(true);
  mocks.limited.mockResolvedValue(false);
  mocks.orgFind.mockResolvedValue({ id: "org_1", slug: "tenant" });
  mocks.membership.mockResolvedValue({ role: "OWNER" });
  mocks.settingsFind.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
});

afterEach(() => vi.unstubAllEnvs());

describe("payment settings actions", () => {
  it("refuses admins and members: payment settings belong to the owner", async () => {
    mocks.membership.mockResolvedValue({ role: "ADMIN" });
    await expect(savePaymentSettings(razorpay)).resolves.toEqual({ ok: false, error: "Only the organisation owner can manage payments." });
    await expect(testPaymentConnection({ organisationSlug: "tenant", provider: "RAZORPAY" })).resolves.toMatchObject({ ok: false });
    await expect(disconnectPaymentProvider({ organisationSlug: "tenant", provider: "RAZORPAY" })).resolves.toMatchObject({ ok: false });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
    expect(mocks.settingsUpdate).not.toHaveBeenCalled();
  });

  it("requires a fresh sign-in before keys change", async () => {
    mocks.recent.mockResolvedValue(false);
    await expect(savePaymentSettings(razorpay)).resolves.toEqual({ ok: false, error: "For security, sign in again before changing payment settings." });
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("encrypts secrets, stores none in plaintext, and audits booleans only", async () => {
    await expect(savePaymentSettings(razorpay)).resolves.toEqual({ ok: true });
    const call = mocks.settingsUpsert.mock.calls[0]![0];
    expect(call.where).toEqual({ organisationId: "org_1" });
    expect(call.create.currency).toBe("INR");
    expect(call.create.webhookPathId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(call.create.razorpayKeySecretEncrypted).toMatch(/^v1\./);
    const stored = JSON.stringify(call);
    expect(stored).not.toContain("TopSecretKey123");
    expect(stored).not.toContain("my-webhook-secret");
    const audit = mocks.auditCreate.mock.calls[0]![0].data;
    expect(audit).toMatchObject({ action: "PAYMENT_SETTINGS_UPDATED", organisationId: "org_1" });
    expect(Object.values(audit.metadata).every((value) => typeof value === "boolean")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("rzp_test_");
  });

  it("refuses to select a provider without all of its credentials", async () => {
    const result = await savePaymentSettings({ ...razorpay, razorpayWebhookSecret: undefined });
    expect(result).toEqual({ ok: false, error: "Enter the Razorpay key id, key secret and webhook secret before choosing Razorpay." });
  });

  it("keeps stored secrets when fields are left blank", async () => {
    mocks.settingsFind.mockResolvedValue({
      organisationId: "org_1", provider: "RAZORPAY", razorpayKeyId: "rzp_test_abcdef123",
      razorpayKeySecretEncrypted: "v1.a.b.c", razorpayWebhookSecretEncrypted: "v1.d.e.f",
      stripeSecretKeyEncrypted: null, stripeWebhookSecretEncrypted: null, stripeTestMode: false,
    });
    await expect(savePaymentSettings({ organisationSlug: "tenant", provider: "RAZORPAY", currency: "INR", razorpayKeySecret: "", razorpayWebhookSecret: "" })).resolves.toEqual({ ok: true });
    const update = mocks.settingsUpsert.mock.calls[0]![0].update;
    expect(update).not.toHaveProperty("razorpayKeySecretEncrypted");
    expect(update).not.toHaveProperty("razorpayWebhookSecretEncrypted");
    expect(update).not.toHaveProperty("verifiedAt");
  });

  it("rejects malformed keys with a field-specific message", async () => {
    await expect(savePaymentSettings({ ...razorpay, provider: null, stripeSecretKey: "pk_live_publishable" })).resolves.toEqual({
      ok: false, error: "Enter a Stripe secret key that starts with sk_test_, sk_live_, rk_test_ or rk_live_.",
    });
  });

  it("tests the connection without echoing provider errors", async () => {
    mocks.settingsFind.mockResolvedValue({
      organisationId: "org_1", provider: "RAZORPAY", razorpayKeyId: "rzp_test_abcdef123",
      razorpayKeySecretEncrypted: encryptPaymentSecret("org_1", "razorpayKeySecretEncrypted", "TopSecretKey123"),
      razorpayWebhookSecretEncrypted: null, stripeSecretKeyEncrypted: null, stripeWebhookSecretEncrypted: null, stripeTestMode: false,
    });
    mocks.testConnection.mockRejectedValueOnce(new PaymentsUnavailable("provider said: Authentication failed for TopSecretKey123", 401));
    await expect(testPaymentConnection({ organisationSlug: "tenant", provider: "RAZORPAY" })).resolves.toEqual({
      ok: false, error: "The provider did not accept these keys. Check them and save again.",
    });
    mocks.testConnection.mockResolvedValueOnce(undefined);
    await expect(testPaymentConnection({ organisationSlug: "tenant", provider: "RAZORPAY" })).resolves.toEqual({ ok: true, data: { testMode: true } });
    expect(mocks.settingsUpdate).toHaveBeenCalledWith({ where: { organisationId: "org_1" }, data: { verifiedAt: expect.any(Date) } });
  });

  it("disconnects a provider and deselects it when it was in use", async () => {
    mocks.settingsFind.mockResolvedValue({ provider: "STRIPE" });
    await expect(disconnectPaymentProvider({ organisationSlug: "tenant", provider: "STRIPE" })).resolves.toEqual({ ok: true });
    expect(mocks.settingsUpdate).toHaveBeenCalledWith({
      where: { organisationId: "org_1" },
      data: { stripeSecretKeyEncrypted: null, stripeWebhookSecretEncrypted: null, stripeTestMode: false, provider: null, verifiedAt: null },
    });
  });
});
