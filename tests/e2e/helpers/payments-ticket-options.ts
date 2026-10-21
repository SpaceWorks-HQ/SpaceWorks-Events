import crypto from "node:crypto";
import { EventStatus } from "@prisma/client";
import { test } from "@playwright/test";
import { expect, fakeProvider, organisationId, orgSlug, prisma, suffix, webhookSecret } from "./payments";

/** Series passes, code-only pay-what-you-want tickets with extras, and paying at the desk. */
export function paymentTicketOptionTests() {
  test("a guest buys a series pass on a date's page, and its ticket lists every date", async ({ browser, baseURL }) => {
    const { webhookPathId } = await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider: "RAZORPAY" }, select: { webhookPathId: true } });
    const hook = await fetch(`${fakeProvider}/__control/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "razorpay", url: `${baseURL}/api/webhooks/razorpay/${webhookPathId}`, secret: webhookSecret }),
    });
    expect(hook.ok).toBe(true);
    const series = await prisma.eventSeries.create({
      data: { organisationId, title: `Pottery course ${suffix.slice(0, 6)}`, slug: `pottery-${suffix}`, recurrenceRule: "FREQ=WEEKLY;COUNT=3", timezone: "UTC", status: EventStatus.PUBLISHED, capacity: 10, currency: "INR" },
    });
    const dates = [];
    for (const week of [1, 2, 3]) {
      const start = new Date(Date.UTC(2035, 4, week * 7, 10));
      dates.push(await prisma.eventInstance.create({ data: { eventSeriesId: series.id, startDateTime: start, endDateTime: new Date(start.getTime() + 7_200_000) } }));
    }
    await prisma.ticketType.create({ data: { eventSeriesId: series.id, name: "Drop-in", priceMinor: BigInt(25000) } });
    await prisma.ticketType.create({ data: { eventSeriesId: series.id, kind: "PASS", name: "Course pass", priceMinor: BigInt(60000) } });

    const buyerEmail = `pass-${suffix}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: "192.0.2.244" } });
    const guest = await context.newPage();
    try {
      await guest.goto(`/${orgSlug}/i/${dates[0]!.id}`, { waitUntil: "networkidle" });
      await expect(guest.getByText("Pass for all 3 remaining dates")).toBeVisible();
      // Choosing the pass clears the single-date ticket: an order is one or the other.
      await guest.getByRole("button", { name: "One more Course pass" }).click();
      await guest.getByLabel("Name", { exact: true }).fill("Pass Holder");
      await guest.getByLabel("Email", { exact: true }).fill(buyerEmail);
      await guest.getByRole("button", { name: "Continue to payment · ₹600.00" }).click();
      await expect(guest).toHaveURL(new RegExp(`^${fakeProvider}/razorpay/pay/`));
      await guest.getByRole("button", { name: "Pay now" }).click();

      const order = await prisma.order.findFirstOrThrow({ where: { buyerEmail }, select: { accessToken: true } });
      await expect(guest).toHaveURL(new RegExp(`/order/${order.accessToken}\\?payment=return$`));
      await expect(guest.getByText("Confirmed", { exact: true })).toBeVisible();
      await expect(guest.getByRole("heading", { name: "Passes" })).toBeVisible();
      const settled = await prisma.order.findFirstOrThrow({ where: { buyerEmail }, include: { rsvps: true } });
      expect(settled).toMatchObject({ status: "CONFIRMED", eventSeriesId: series.id, eventInstanceId: null, totalMinor: BigInt(60000) });
      expect(settled.rsvps.map((rsvp) => rsvp.status)).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED"]);

      await guest.getByRole("link", { name: "View ticket" }).click();
      const otherDates = guest.getByRole("region", { name: "Your other dates" });
      await expect(otherDates.getByRole("link", { name: "Ticket" })).toHaveCount(2);
    } finally {
      await context.close();
    }
  });

  test("a guest unlocks a code-only ticket, chooses what to pay, adds an extra and pays", async ({ browser }) => {
    await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { provider: "RAZORPAY" } });
    const event = await prisma.event.create({
      data: {
        organisationId, title: `Supporters night ${suffix.slice(0, 6)}`, slug: `supporters-${suffix}`, capacity: 20, timezone: "UTC", status: EventStatus.PUBLISHED, currency: "INR",
        startDateTime: new Date("2035-06-01T10:00:00.000Z"), endDateTime: new Date("2035-06-01T12:00:00.000Z"), page: { create: { isPublished: true } },
      },
    });
    const code = `FRIENDS-${suffix.slice(0, 4)}`.toUpperCase();
    await prisma.ticketType.create({
      data: {
        eventId: event.id, name: "Supporter", priceMinor: BigInt(10000), pricing: "FLEXIBLE", suggestedMinor: BigInt(50000), visibility: "CODE",
        accessCodeDigest: crypto.createHash("sha256").update(code).digest("hex"), accessCodeHint: code.slice(0, 3),
      },
    });
    await prisma.addOn.create({ data: { eventId: event.id, name: "Tote bag", priceMinor: BigInt(20000) } });

    const buyerEmail = `supporter-${suffix}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: "192.0.2.245" } });
    const guest = await context.newPage();
    try {
      await guest.goto(`/${orgSlug}/${event.slug}`, { waitUntil: "networkidle" });
      await guest.getByRole("button", { name: "Get tickets" }).first().click();
      const dialog = guest.getByRole("dialog");
      await dialog.getByLabel("Access code").fill(code);
      await dialog.getByRole("button", { name: "Unlock" }).click();
      await expect(dialog.getByText("Unlocked with your code")).toBeVisible();
      await dialog.getByRole("button", { name: "One more Supporter" }).click();
      await dialog.getByLabel(/^Your price per ticket/).fill("750");
      await dialog.getByRole("button", { name: "One more Tote bag" }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("Generous Guest");
      await dialog.getByLabel("Email", { exact: true }).fill(buyerEmail);
      await dialog.getByRole("button", { name: "Continue to payment · ₹950.00" }).click();
      await expect(guest).toHaveURL(new RegExp(`^${fakeProvider}/razorpay/pay/`));
      const order = await prisma.order.findFirstOrThrow({ where: { buyerEmail }, include: { lines: true } });
      expect(order.totalMinor).toBe(BigInt(95000));
      expect(order.lines.map((line) => [line.kind, line.unitMinor]).sort()).toEqual([["ADD_ON", BigInt(20000)], ["TICKET", BigInt(75000)]].sort());
    } finally {
      await context.close();
    }
  });

  test("a guest reserves to pay at the desk, then transfers the ticket from the order page", async ({ browser }) => {
    const event = await prisma.event.create({
      data: {
        organisationId, title: `Desk night ${suffix.slice(0, 6)}`, slug: `desk-${suffix}`, capacity: 20, timezone: "UTC", status: EventStatus.PUBLISHED, currency: "INR", allowTransfers: true,
        startDateTime: new Date("2035-07-01T10:00:00.000Z"), endDateTime: new Date("2035-07-01T12:00:00.000Z"), page: { create: { isPublished: true } },
      },
    });
    await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceMinor: BigInt(30000), payAtDesk: true } });
    const buyerEmail = `desk-${suffix}@example.test`;
    const friendEmail = `desk-friend-${suffix}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { [process.env.PLAYWRIGHT_TRUSTED_IP_HEADER || "cf-connecting-ip"]: "192.0.2.246" } });
    const guest = await context.newPage();
    try {
      await guest.goto(`/${orgSlug}/${event.slug}`, { waitUntil: "networkidle" });
      await guest.getByRole("button", { name: "Get tickets" }).first().click();
      const dialog = guest.getByRole("dialog");
      await dialog.getByRole("radio", { name: "Pay at the desk" }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("Desk Guest");
      await dialog.getByLabel("Email", { exact: true }).fill(buyerEmail);
      await dialog.getByRole("button", { name: "Reserve, pay ₹300.00 at the desk" }).click();
      await expect.poll(async () => (await prisma.order.findFirst({ where: { buyerEmail }, select: { status: true } }))?.status).toBe("CONFIRMED");
      const order = await prisma.order.findFirstOrThrow({ where: { buyerEmail }, include: { payments: true } });
      expect(order.payments).toEqual([expect.objectContaining({ status: "PENDING", provider: "OFFLINE" })]);

      await guest.goto(`/order/${order.accessToken}`);
      await guest.getByRole("button", { name: "Transfer" }).click();
      await guest.getByLabel("Their name").fill("Desk Friend");
      await guest.getByLabel("Their email").fill(friendEmail);
      await guest.getByRole("button", { name: "Transfer ticket" }).click();
      await expect.poll(async () => (await prisma.rSVP.findFirst({ where: { orderId: order.id }, select: { guestEmail: true } }))?.guestEmail).toBe(friendEmail);
    } finally {
      await context.close();
    }
  });
}
