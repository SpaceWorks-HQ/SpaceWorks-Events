import crypto, { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { MembershipRole, PrismaClient } from "@prisma/client";
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
const userIds: string[] = [];

test.beforeAll(async () => {
  const organisation = await prisma.organisation.create({ data: { name: `Payments ${suffix}`, slug: orgSlug } });
  organisationId = organisation.id;
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [email, role] of [[ownerEmail, MembershipRole.OWNER], [adminEmail, MembershipRole.ADMIN]] as const) {
    const user = await prisma.user.create({
      data: { email, name: `Payments ${role.toLowerCase()}`, passwordHash, emailVerified: new Date(), memberships: { create: { organisationId, role } } },
    });
    userIds.push(user.id);
  }
});

test.afterAll(async () => {
  if (organisationId) await prisma.organisation.delete({ where: { id: organisationId } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function signIn(page: Page, email: string, ip: string) {
  await page.context().setExtraHTTPHeaders({ [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: ip });
  await page.request.get("/api/auth/csrf");
  // A dev server may reload the page while it compiles a route; retry the form then.
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login?callbackUrl=%2Fdashboard", { waitUntil: "networkidle" });
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
