import crypto, { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { EventStatus, MembershipRole, PrismaClient } from "@prisma/client";
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Dev servers compile each route on first visit, which can take a while.
const expect = baseExpect.configure({ timeout: 60_000 });

// Drives a local fake Razorpay (tests/e2e/fake-payment-provider.mjs) against a
// development server. The app refuses PAYMENTS_FAKE_PROVIDER_URL in
// production, so this runs only with PLAYWRIGHT_FAKE_PAYMENTS=1.
test.skip(process.env.PLAYWRIGHT_FAKE_PAYMENTS !== "1" || process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1", "Set PLAYWRIGHT_FAKE_PAYMENTS=1 with a development server.");
// Keys and webhook secrets must never be captured in trace artifacts.
test.use({ trace: "off" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

const prisma = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "");
const orgSlug = `payments-${suffix}`;
const password = "payments-browser-password";
const ownerEmail = `pay-owner-${suffix}@example.test`;
const adminEmail = `pay-admin-${suffix}@example.test`;
const keySecret = `KeySecret${suffix.slice(0, 12)}`;
const webhookSecret = `webhook-${suffix}`;
let organisationId = "";
let eventId = "";
const eventSlug = `paid-event-${suffix}`;
const stripeSecret = `whsec_${suffix}`;
const userIds: string[] = [];
const fakeProvider = `http://127.0.0.1:${process.env.FAKE_PROVIDER_PORT || 4010}`;
let previousPaidEvents: boolean | null = null;

test.beforeAll(async () => {
  // A development server compiles each route on first visit and reloads open
  // pages while it does; compile the pages this spec visits up front.
  const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || 3000}`;
  for (const path of ["/login", "/dashboard", "/api/auth/csrf", "/api/auth/session"]) {
    await fetch(`${base}${path}`, { redirect: "manual" }).catch(() => undefined);
  }
  const organisation = await prisma.organisation.create({ data: { name: `Payments ${suffix}`, slug: orgSlug } });
  organisationId = organisation.id;
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [email, role] of [[ownerEmail, MembershipRole.OWNER], [adminEmail, MembershipRole.ADMIN]] as const) {
    const user = await prisma.user.create({
      data: { email, name: `Payments ${role.toLowerCase()}`, passwordHash, emailVerified: new Date(), memberships: { create: { organisationId, role } } },
    });
    userIds.push(user.id);
  }
  eventId = (await prisma.event.create({
    data: {
      organisationId, title: `Paid meetup ${suffix.slice(0, 6)}`, slug: eventSlug, capacity: 20, timezone: "UTC", status: EventStatus.PUBLISHED,
      startDateTime: new Date("2035-03-01T10:00:00.000Z"), endDateTime: new Date("2035-03-01T12:00:00.000Z"), page: { create: { isPublished: true } },
    },
  })).id;
  const settings = await prisma.instanceSetting.findUnique({ where: { id: "global" } });
  previousPaidEvents = settings?.paidEventsEnabled ?? null;
  await prisma.instanceSetting.upsert({ where: { id: "global" }, create: { id: "global", paidEventsEnabled: true }, update: { paidEventsEnabled: true } });
});

test.afterAll(async () => {
  if (previousPaidEvents === null) await prisma.instanceSetting.updateMany({ where: { id: "global" }, data: { paidEventsEnabled: false } });
  else await prisma.instanceSetting.update({ where: { id: "global" }, data: { paidEventsEnabled: previousPaidEvents } });
  if (organisationId) await prisma.organisation.delete({ where: { id: organisationId } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function signIn(page: Page, email: string, ip: string) {
  await page.context().setExtraHTTPHeaders({ [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: ip });
  await page.request.get("/api/auth/csrf");
  // A dev server may reload the page while it compiles a route; retry the form then.
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login?callbackUrl=%2Fdashboard", { waitUntil: "load" });
    await page.getByRole("textbox", { name: /^Email/ }).fill(email);
    await page.locator('input[type="password"]:visible').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try {
      await baseExpect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

function signedRazorpay(body: unknown, secret: string, eventId: string) {
  const raw = JSON.stringify(body);
  return {
    data: raw,
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": crypto.createHmac("sha256", secret).update(raw).digest("hex"),
      "x-razorpay-event-id": eventId,
    },
  };
}

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

test("a guest's promo code is priced in the form and charged by the provider", async ({ browser }) => {
  await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider: "RAZORPAY" } });
  const buyerEmail = `promo-${suffix}@example.test`;
  const context = await browser.newContext({ extraHTTPHeaders: { [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: "192.0.2.241" } });
  const guest = await context.newPage();
  try {
    await guest.goto(`/${orgSlug}/${eventSlug}`, { waitUntil: "networkidle" });
    await guest.getByRole("button", { name: "Get tickets" }).first().click();
    const dialog = guest.getByRole("dialog");
    await expect(dialog.getByText("Full refund if you cancel until 2 days before the event.")).toBeVisible();
    await dialog.getByLabel(/^Promo code/).fill("not-a-code");
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByText("That promo code isn't valid.")).toBeVisible();
    await dialog.getByLabel(/^Promo code/).fill(`save10-${suffix.slice(0, 6)}`);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByText("Discount: −₹49.90 · Total ₹449.10")).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill("Promo Guest");
    await dialog.getByLabel("Email", { exact: true }).fill(buyerEmail);
    await dialog.getByRole("button", { name: "Continue to payment · ₹449.10" }).click();
    await expect(guest).toHaveURL(new RegExp(`^${fakeProvider}/razorpay/pay/`));
    expect(await prisma.order.findFirstOrThrow({ where: { eventId, buyerEmail }, select: { subtotalMinor: true, discountMinor: true, totalMinor: true, refundPolicy: true } })).toMatchObject({
      subtotalMinor: BigInt(49900), discountMinor: BigInt(4990), totalMinor: BigInt(44910), refundPolicy: { kind: "FULL_UNTIL", hours: 48 },
    });
  } finally {
    await context.close();
  }
});

for (const provider of ["STRIPE", "RAZORPAY"] as const) {
  test(`a guest buys two tickets through ${provider === "STRIPE" ? "Stripe" : "Razorpay"}'s hosted page`, async ({ browser, baseURL }) => {
    const { webhookPathId } = await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider }, select: { webhookPathId: true } });
    // The fake provider delivers signed webhooks to this organisation's address.
    const hook = await fetch(`${fakeProvider}/__control/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider.toLowerCase(), url: `${baseURL}/api/webhooks/${provider.toLowerCase()}/${webhookPathId}`, secret: provider === "STRIPE" ? stripeSecret : webhookSecret }),
    });
    expect(hook.ok).toBe(true);

    const buyerEmail = `buyer-${provider.toLowerCase()}-${suffix}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: provider === "STRIPE" ? "192.0.2.238" : "192.0.2.239" } });
    const guest = await context.newPage();
    try {
      await guest.goto(`/${orgSlug}/${eventSlug}`, { waitUntil: "networkidle" });
      await guest.getByRole("button", { name: "Get tickets" }).first().click();
      const dialog = guest.getByRole("dialog");
      await dialog.getByRole("button", { name: "One more Standard" }).click();
      await dialog.getByLabel("Ticket 2: name", { exact: false }).fill("Second Guest");
      await dialog.getByLabel("Name", { exact: true }).fill("Paying Guest");
      await dialog.getByLabel("Email", { exact: true }).fill(buyerEmail);
      await dialog.getByRole("button", { name: "Continue to payment · ₹998.00" }).click();

      // The provider's hosted page: the app never sees card or UPI details.
      await expect(guest).toHaveURL(new RegExp(`^${fakeProvider}/${provider.toLowerCase()}/pay/`));
      const order = await prisma.order.findFirstOrThrow({ where: { eventId, buyerEmail }, include: { rsvps: true } });
      expect(order).toMatchObject({ status: "PENDING", totalMinor: BigInt(99800) });
      expect(order.rsvps.map((rsvp) => rsvp.status)).toEqual(["PENDING_PAYMENT", "PENDING_PAYMENT"]);
      await guest.getByRole("button", { name: "Pay now" }).click();

      // Back on the order page, confirmed by the signed webhook.
      await expect(guest).toHaveURL(new RegExp(`/order/${order.accessToken}\\?payment=return$`));
      await expect(guest.getByText("Confirmed", { exact: true })).toBeVisible();
      await expect(guest.getByRole("link", { name: "View ticket" })).toHaveCount(2);
      const settled = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: { include: { attempts: true } }, rsvps: true } });
      expect(settled.status).toBe("CONFIRMED");
      expect(settled.payments[0]).toMatchObject({ status: "PAID_ONLINE", provider, testMode: true });
      expect(settled.payments[0]!.attempts[0]!.status).toBe("PAID");
      expect(settled.rsvps.map((rsvp) => rsvp.status)).toEqual(["CONFIRMED", "CONFIRMED"]);

      // The receipt is the proof of payment, with the provider's payment details.
      const receiptLink = guest.getByRole("link", { name: "Download receipt (PDF)" });
      await expect(receiptLink).toHaveAttribute("href", `/api/orders/${order.accessToken}/receipt`);
      const receipt = await guest.request.get(`/api/orders/${order.accessToken}/receipt`);
      expect(receipt.status()).toBe(200);
      expect(receipt.headers()["content-type"]).toBe("application/pdf");
      expect((await receipt.body()).subarray(0, 5).toString()).toBe("%PDF-");
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: settled.payments[0]!.id }, select: { methodSummary: true } })).toEqual({ methodSummary: provider === "STRIPE" ? "Mastercard •••• 4444" : "Visa •••• 4242" });
    } finally {
      await context.close();
    }
  });
}

for (const provider of ["STRIPE", "RAZORPAY"] as const) {
  test(`an organiser refunds part of a ${provider === "STRIPE" ? "Stripe" : "Razorpay"} order, then cancels it from the guest list`, async ({ page }) => {
    await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider } });
    const buyerEmail = `buyer-${provider.toLowerCase()}-${suffix}@example.test`;
    const order = await prisma.order.findFirstOrThrow({ where: { eventId, buyerEmail }, select: { id: true, status: true } });
    expect(order.status).toBe("CONFIRMED");

    await signIn(page, ownerEmail, provider === "STRIPE" ? "192.0.2.242" : "192.0.2.243");
    await page.goto(`/dashboard/${orgSlug}/event/${eventId}?tab=guests`);
    const row = page.getByRole("listitem").filter({ hasText: buyerEmail });
    await expect(row.getByText("Paid ₹998.00 (test)")).toBeVisible();
    await row.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Payment" });
    await dialog.getByLabel(/^Amount \(INR\)/).fill("100");
    await dialog.getByLabel(/^Reason/).fill("Parking was closed");
    await dialog.getByRole("button", { name: "Refund", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Refund recorded." })).toBeVisible();
    // The provider confirms the refund by webhook.
    await expect.poll(async () => (await prisma.paymentRefund.findFirst({ where: { payment: { orderId: order.id } }, select: { status: true, amountMinor: true } })), { timeout: 30_000 })
      .toEqual({ status: "SUCCEEDED", amountMinor: BigInt(10000) });
    await page.reload();
    await expect(row.getByText("Paid ₹998.00, part refunded (test)")).toBeVisible();

    await row.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Payment" }).click();
    await dialog.getByRole("tab", { name: "Cancel tickets" }).click();
    await dialog.getByLabel(/^Reason/).fill("Event moved");
    await dialog.getByRole("button", { name: "Cancel tickets" }).last().click();
    await expect(page.getByRole("status").filter({ hasText: "Order cancelled." })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: buyerEmail })).toHaveCount(0);
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { rsvps: true, payments: { include: { refunds: true } } } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.rsvps).toEqual([]);
    expect(cancelled.payments[0]!.refunds.reduce((sum, refund) => sum + refund.amountMinor, BigInt(0))).toBe(BigInt(99800));
  });
}
