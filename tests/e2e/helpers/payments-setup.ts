import crypto from "node:crypto";
import { test } from "@playwright/test";
import { adminEmail, eventId, expect, keySecret, organisationId, orgSlug, ownerEmail, prisma, signedRazorpay, signIn, stripeSecret, suffix, webhookSecret } from "./payments";

/** Payment settings, webhooks, a paid ticket, a promo code and the refund policy. */
export function paymentSetupTests() {
  test("an admin cannot open payment settings", async ({ page }) => {
    await signIn(page, adminEmail, "192.0.2.231");
    await page.goto(`/dashboard/${orgSlug}/settings/payments`);
    await expect(page).not.toHaveURL(/\/settings\/payments$/);
    await page.goto(`/dashboard/${orgSlug}/settings`);
    await expect(page.getByRole("heading", { name: "Payments" })).toHaveCount(0);
  });

  test("the owner connects Razorpay with write-only keys and tests the connection", async ({ page }) => {
    await signIn(page, ownerEmail, "192.0.2.232");
    await page.goto(`/dashboard/${orgSlug}/settings`);
    await page.getByRole("link", { name: "Manage payments" }).click();
    await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();

    await page.getByLabel("Key id").fill("rzp_test_e2etest01");
    await page.getByLabel(/^Key secret/).fill(keySecret);
    await page.getByLabel(/^Webhook secret/).fill(webhookSecret);
    await page.getByRole("radio", { name: /^Razorpay/ }).click();
    await page.getByRole("button", { name: "Save payment settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Payment settings saved." })).toBeVisible();

    // The page never renders a saved secret back.
    await expect(page.getByLabel(/^Key secret \(saved/)).toHaveValue("");
    expect(await page.content()).not.toContain(keySecret);
    await expect(page.getByText("Ready: Razorpay")).toBeVisible();
    await expect(page.getByText("Test mode")).toBeVisible();

    await page.getByRole("button", { name: "Test connection" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Connected. These are test keys" })).toBeVisible();

    const row = await prisma.organisationPaymentSettings.findUniqueOrThrow({ where: { organisationId } });
    expect(row.provider).toBe("RAZORPAY");
    expect(row.verifiedAt).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(keySecret);
    expect(JSON.stringify(row)).not.toContain(webhookSecret);

    const address = await page.getByText(`/api/webhooks/razorpay/${row.webhookPathId}`).textContent();
    expect(address).toContain(`/api/webhooks/razorpay/${row.webhookPathId}`);
  });

  test("webhooks are verified with the organisation's secret and recorded once", async ({ request }) => {
    const { webhookPathId } = await prisma.organisationPaymentSettings.findUniqueOrThrow({ where: { organisationId } });
    const url = `/api/webhooks/razorpay/${webhookPathId}`;
    const body = { event: "payment.authorized", payload: { payment: { entity: { id: "pay_e2e", amount: 100, currency: "INR", status: "authorized" } } } };

    const forged = await request.post(url, signedRazorpay(body, "not-the-secret", `e2e-forged-${suffix}`));
    expect(forged.status()).toBe(400);
    expect(await forged.text()).toBe("");

    const signed = signedRazorpay(body, webhookSecret, `e2e-${suffix}`);
    expect((await request.post(url, signed)).status()).toBe(200);
    expect((await request.post(url, signed)).status()).toBe(200);
    expect(await prisma.processedWebhookEvent.count({ where: { organisationId } })).toBe(1);
  });

  test("the owner connects Stripe too, and Stripe webhooks are verified the same way", async ({ page, request }) => {
    await signIn(page, ownerEmail, "192.0.2.236");
    await page.goto(`/dashboard/${orgSlug}/settings/payments`);
    await page.getByLabel(/^Secret key/).fill(`sk_test_${suffix}`);
    await page.getByLabel(/^Signing secret/).fill(stripeSecret);
    await page.getByRole("radio", { name: /^Stripe/ }).click();
    await page.getByRole("button", { name: "Save payment settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Payment settings saved." })).toBeVisible();
    await expect(page.getByText("Ready: Stripe")).toBeVisible();
    await page.getByRole("button", { name: "Test connection" }).nth(1).click();
    await expect(page.getByRole("status").filter({ hasText: "Connected. These are test keys" })).toBeVisible();
    expect(await page.content()).not.toContain(stripeSecret);

    const { webhookPathId } = await prisma.organisationPaymentSettings.findUniqueOrThrow({ where: { organisationId } });
    const raw = JSON.stringify({ id: `evt_${suffix}`, type: "checkout.session.expired", data: { object: { id: "cs_test_e2e" } } });
    const sign = (secret: string) => {
      const timestamp = Math.floor(Date.now() / 1000);
      return `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
    };
    const url = `/api/webhooks/stripe/${webhookPathId}`;
    expect((await request.post(url, { data: raw, headers: { "content-type": "application/json", "stripe-signature": sign("whsec_forged_secret_value") } })).status()).toBe(400);
    expect((await request.post(url, { data: raw, headers: { "content-type": "application/json", "stripe-signature": sign(stripeSecret) } })).status()).toBe(200);
    expect(await prisma.processedWebhookEvent.count({ where: { organisationId, provider: "STRIPE" } })).toBe(1);
  });

  test("the owner adds a paid ticket", async ({ page }) => {
    await signIn(page, ownerEmail, "192.0.2.237");
    await page.goto(`/dashboard/${orgSlug}/event/${eventId}?tab=settings`);
    const tickets = page.getByRole("region", { name: "Tickets" });
    await tickets.getByRole("button", { name: "Add ticket" }).click();
    await tickets.getByLabel("Ticket name").fill("Standard");
    await tickets.getByLabel(/^Price \(INR\)/).fill("499");
    await tickets.getByRole("button", { name: "Add ticket" }).click();
    await expect(tickets.getByText("₹499.00")).toBeVisible();
    expect((await prisma.ticketType.findFirstOrThrow({ where: { eventId } })).priceMinor).toBe(BigInt(49900));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).currency).toBe("INR");
  });

  test("the owner adds a promo code and a refund policy", async ({ page }) => {
    await signIn(page, ownerEmail, "192.0.2.240");
    await page.goto(`/dashboard/${orgSlug}/event/${eventId}?tab=settings`);
    const promos = page.getByRole("region", { name: "Promo codes" });
    await promos.getByRole("button", { name: "Add code" }).click();
    await promos.getByLabel(/^Code/).fill(`save10-${suffix.slice(0, 6)}`);
    await promos.getByRole("textbox", { name: /^Percent/ }).fill("10");
    await promos.getByRole("button", { name: "Add code" }).click();
    await expect(promos.getByText("10% off each ticket")).toBeVisible();
    const stored = await prisma.promoCode.findFirstOrThrow({ where: { eventId } });
    // Only a digest and a hint are kept.
    expect(stored.codeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(`SAVE10-${suffix.slice(0, 6).toUpperCase()}`);

    const policy = page.getByRole("region", { name: "Refund policy" });
    await policy.getByRole("radio", { name: "Guests can cancel for a full refund" }).click();
    await policy.getByLabel(/^Hours before the start/).fill("48");
    await policy.getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Refund policy saved." })).toBeVisible();
    expect(await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { refundPolicyKind: true, refundPolicyHours: true } })).toEqual({ refundPolicyKind: "FULL_UNTIL", refundPolicyHours: 48 });
  });
}
