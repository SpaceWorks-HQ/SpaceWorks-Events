import { randomUUID } from "node:crypto";
import { EventStatus, PaymentStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const suffix = randomUUID().replace(/-/g, "");
let organisationId = "";
let eventId = "";

async function order(totalMinor = 100000) {
  return prisma.order.create({
    data: {
      organisationId, eventId, reference: `T${suffix.slice(0, 7).toUpperCase()}${Math.floor(Math.random() * 1000)}`.slice(0, 16),
      buyerEmail: "buyer@example.test", buyerName: "Buyer", currency: "INR", subtotalMinor: BigInt(totalMinor), totalMinor: BigInt(totalMinor),
      holdExpiresAt: new Date(Date.now() + 30 * 60_000), holdCapAt: new Date(Date.now() + 60 * 60_000),
      lines: { create: { description: "General × 1", quantity: 1, unitMinor: BigInt(totalMinor), totalMinor: BigInt(totalMinor) } },
    },
  });
}

describe.sequential("payment ledger constraints", () => {
  beforeAll(async () => {
    organisationId = (await prisma.organisation.create({ data: { name: "Ledger org", slug: `ledger-${suffix}` } })).id;
    eventId = (await prisma.event.create({
      data: { organisationId, title: "Ledger event", slug: `ledger-event-${suffix}`, startDateTime: new Date("2035-01-01T10:00:00Z"), endDateTime: new Date("2035-01-01T11:00:00Z"), timezone: "UTC", status: EventStatus.PUBLISHED, currency: "INR" },
    })).id;
  });

  afterAll(async () => {
    if (organisationId) await prisma.organisation.delete({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("keeps settled payments immutable and allows one pending payment per order", async () => {
    const { id: orderId } = await order();
    const payment = await prisma.payment.create({ data: { organisationId, orderId, amountMinor: BigInt(100000), currency: "INR", provider: "RAZORPAY", description: "Ledger event" } });
    await expect(prisma.payment.create({ data: { organisationId, orderId, amountMinor: BigInt(1), currency: "INR", provider: "RAZORPAY", description: "Second" } })).rejects.toThrow();
    await expect(prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID_ONLINE, paidAt: new Date() } })).rejects.toThrow();
    await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID_ONLINE, paidAt: new Date(), externalPaymentId: `pay_${suffix}` } });
    await expect(prisma.payment.update({ where: { id: payment.id }, data: { amountMinor: BigInt(1) } })).rejects.toThrow(/immutable/);
    await expect(prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.CANCELED } })).rejects.toThrow(/immutable/);
    await expect(prisma.payment.update({ where: { id: payment.id }, data: { externalPaymentId: "pay_other" } })).rejects.toThrow(/immutable/);
  });

  it("never refunds more than was paid, nor an uncollected payment", async () => {
    const { id: orderId } = await order(50000);
    const pending = await prisma.payment.create({ data: { organisationId, orderId, amountMinor: BigInt(50000), currency: "INR", provider: "STRIPE", description: "Ledger event" } });
    await expect(prisma.paymentRefund.create({ data: { paymentId: pending.id, amountMinor: BigInt(1) } })).rejects.toThrow(/collected/);
    await prisma.payment.update({ where: { id: pending.id }, data: { status: PaymentStatus.PAID_ONLINE, paidAt: new Date(), externalPaymentId: `pi_${suffix}` } });
    await prisma.paymentRefund.create({ data: { paymentId: pending.id, amountMinor: BigInt(30000) } });
    await expect(prisma.paymentRefund.create({ data: { paymentId: pending.id, amountMinor: BigInt(20001) } })).rejects.toThrow(/exceed/);
    await prisma.paymentRefund.create({ data: { paymentId: pending.id, amountMinor: BigInt(20000), offline: true, status: "SUCCEEDED" } });
  });

  it("keeps a checkout attempt's provider page once known and never reopens a finished one", async () => {
    const { id: orderId } = await order();
    const payment = await prisma.payment.create({ data: { organisationId, orderId, amountMinor: BigInt(100000), currency: "INR", provider: "RAZORPAY", description: "Ledger event" } });
    const attempt = await prisma.paymentCheckoutAttempt.create({ data: { paymentId: payment.id, provider: "RAZORPAY", expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await prisma.paymentCheckoutAttempt.update({ where: { id: attempt.id }, data: { externalId: `plink_${suffix}`, url: "https://rzp.example/i/x" } });
    await expect(prisma.paymentCheckoutAttempt.update({ where: { id: attempt.id }, data: { externalId: "plink_other" } })).rejects.toThrow(/immutable/);
    await prisma.paymentCheckoutAttempt.update({ where: { id: attempt.id }, data: { status: "CANCELLED" } });
    await expect(prisma.paymentCheckoutAttempt.update({ where: { id: attempt.id }, data: { status: "OPEN" } })).rejects.toThrow(/immutable/);
    // A page cancelled too late may still have been paid: that is recorded.
    await prisma.paymentCheckoutAttempt.update({ where: { id: attempt.id }, data: { status: "PAID" } });
    await expect(prisma.paymentCheckoutAttempt.create({ data: { paymentId: payment.id, provider: "OFFLINE", expiresAt: new Date() } })).rejects.toThrow();
  });

  it("enforces money shapes on orders, lines and holds", async () => {
    await expect(prisma.order.create({ data: { organisationId, reference: "lowercase-ref", buyerEmail: "b@example.test", buyerName: "B", currency: "INR", holdExpiresAt: new Date(), holdCapAt: new Date() } })).rejects.toThrow();
    await expect(prisma.order.create({ data: { organisationId, reference: `P${suffix.slice(0, 8).toUpperCase()}`, buyerEmail: "b@example.test", buyerName: "B", currency: "inr", holdExpiresAt: new Date(), holdCapAt: new Date() } })).rejects.toThrow();
    // A pending order always has a hold.
    await expect(prisma.order.create({ data: { organisationId, reference: `Q${suffix.slice(0, 8).toUpperCase()}`, buyerEmail: "b@example.test", buyerName: "B", currency: "INR" } })).rejects.toThrow();
    const { id: orderId } = await order();
    await expect(prisma.orderLine.create({ data: { orderId, description: "Bad", quantity: 0, unitMinor: BigInt(1), totalMinor: BigInt(1) } })).rejects.toThrow();
    await expect(prisma.event.update({ where: { id: eventId }, data: { currency: "rupees" } })).rejects.toThrow();
    await expect(prisma.rSVP.create({ data: { eventId, attendeeKey: `held-${suffix}`, status: "PENDING_PAYMENT" } })).rejects.toThrow();
  });
});
