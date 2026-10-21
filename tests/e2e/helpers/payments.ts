// Shared state, setup and helpers for tests/e2e/payments.spec.ts. Its tests
// run in order against one organisation and event created here.
import crypto, { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { EventStatus, MembershipRole, PrismaClient } from "@prisma/client";
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Dev servers compile each route on first visit, which can take a while.
export const expect = baseExpect.configure({ timeout: 60_000 });

export const prisma = new PrismaClient();
export const suffix = randomUUID().replaceAll("-", "");
export const orgSlug = `payments-${suffix}`;
const password = "payments-browser-password";
export const ownerEmail = `pay-owner-${suffix}@example.test`;
export const adminEmail = `pay-admin-${suffix}@example.test`;
export const keySecret = `KeySecret${suffix.slice(0, 12)}`;
export const webhookSecret = `webhook-${suffix}`;
export let organisationId = "";
export let eventId = "";
export const eventSlug = `paid-event-${suffix}`;
export const stripeSecret = `whsec_${suffix}`;
const userIds: string[] = [];
export const fakeProvider = `http://127.0.0.1:${process.env.FAKE_PROVIDER_PORT || 4010}`;
let previousPaidEvents: boolean | null = null;

/** Creates the organisation, its staff and the paid event before the suite, and removes them after. */
export function setUpPaymentsSuite() {
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
}

export async function signIn(page: Page, email: string, ip: string) {
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

export function signedRazorpay(body: unknown, secret: string, eventId: string) {
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
