import { test } from "@playwright/test";
import { eventId, eventSlug, expect, fakeProvider, organisationId, orgSlug, ownerEmail, prisma, signIn, stripeSecret, suffix, webhookSecret } from "./payments";

/** Guests buying through each provider, then organisers refunding and cancelling those orders. */
export function paymentCheckoutTests() {
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
}
