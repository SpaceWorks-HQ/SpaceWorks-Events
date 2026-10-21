import { randomUUID } from "node:crypto";
import { EventStatus, MembershipRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));

import { GET as exportEventOrders } from "@/app/api/exports/events/[eventId]/orders/route";
import { listApiOrders } from "@/lib/api/v1/events";
import { prisma } from "@/lib/db";
import { loadOrganisationRevenue, loadRevenue } from "@/lib/payments/revenue";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const users = { owner: "", member: "", outsider: "" };
const ids = { organisation: "", other: "", event: "", otherEvent: "" };
let counter = 0;

async function order(eventId: string, organisationId: string, options: { paid?: bigint; refund?: bigint; status?: "CONFIRMED" | "CANCELLED"; } = {}) {
  counter += 1;
  const total = BigInt(100000);
  return prisma.order.create({
    data: {
      organisationId, eventId, reference: `RPT-${suffix.slice(0, 6).toUpperCase()}${counter}`.slice(0, 16), buyerEmail: `buyer${counter}@example.test`, buyerName: `Buyer ${counter}`,
      status: options.status ?? "CONFIRMED", currency: "INR", subtotalMinor: total, totalMinor: total,
      lines: { create: [{ description: "General", quantity: 2, unitMinor: BigInt(50000), totalMinor: total }] },
      ...(options.paid ? {
        payments: { create: [{
          organisationId, amountMinor: options.paid, currency: "INR", status: "PAID_ONLINE", provider: "RAZORPAY", externalPaymentId: `pay_${suffix}${counter}`,
          description: "Tickets", paidAt: new Date(), methodSummary: "Visa •••• 4242",
          ...(options.refund ? { refunds: { create: [{ amountMinor: options.refund, status: "SUCCEEDED" }] } } : {}),
        }] },
      } : {}),
    },
  });
}

const exportRequest = (eventId: string) => exportEventOrders(new Request(`http://127.0.0.1/api/exports/events/${eventId}/orders`), { params: Promise.resolve({ eventId }) });

beforeAll(async () => {
  for (const key of Object.keys(users) as Array<keyof typeof users>) {
    users[key] = (await prisma.user.create({ data: { name: key, email: `${key}-${suffix}@example.test`, emailVerified: new Date() } })).id;
  }
  const organisation = await prisma.organisation.create({ data: { name: "Report Makers", slug: `reports-${suffix}` } });
  const other = await prisma.organisation.create({ data: { name: "Other Makers", slug: `reports-other-${suffix}` } });
  ids.organisation = organisation.id;
  ids.other = other.id;
  await prisma.membership.createMany({ data: [
    { userId: users.owner, organisationId: organisation.id, role: MembershipRole.OWNER },
    { userId: users.member, organisationId: organisation.id, role: MembershipRole.MEMBER },
    { userId: users.outsider, organisationId: other.id, role: MembershipRole.OWNER },
  ] });
  const event = (organisationId: string, slug: string) => prisma.event.create({ data: {
    organisationId, title: `Report event ${slug}`, slug: `${slug}-${suffix}`, currency: "INR", timezone: "Asia/Kolkata", status: EventStatus.PUBLISHED,
    startDateTime: new Date("2035-01-01T10:00:00Z"), endDateTime: new Date("2035-01-01T12:00:00Z"),
  } });
  ids.event = (await event(organisation.id, "a")).id;
  ids.otherEvent = (await event(other.id, "b")).id;
  await order(ids.event, organisation.id, { paid: BigInt(100000) });
  await order(ids.event, organisation.id, { paid: BigInt(100000), refund: BigInt(40000) });
  await order(ids.event, organisation.id, { status: "CANCELLED" });
  await order(ids.otherEvent, other.id, { paid: BigInt(100000) });
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: { in: [ids.organisation, ids.other] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

describe("payment reporting", () => {
  it("sums an event's takings after refunds", async () => {
    const summary = await loadRevenue({ eventId: ids.event }, "Asia/Kolkata");
    expect(summary).toMatchObject({ collectedMinor: 200000, refundedMinor: 40000, netMinor: 160000, orders: { paid: 2, cancelled: 1 } });
    expect(summary?.byMethod).toEqual([{ label: "Razorpay", payments: 2, amountMinor: 200000 }]);
  });

  it("ranks the organisation's events by net takings, per currency, and nothing else's", async () => {
    const revenue = await loadOrganisationRevenue(ids.organisation, { since: new Date(Date.now() - 86_400_000), timeZone: "UTC" });
    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({ currency: "INR", summary: { netMinor: 160000 } });
    expect(revenue[0]!.top).toEqual([{ title: "Report event a", href: `event/${ids.event}`, netMinor: 160000, paidOrders: 2 }]);
  });

  it("exports orders as CSV to organisers only", async () => {
    identity.id = users.member;
    expect((await exportRequest(ids.event)).status).toBe(404);
    identity.id = users.outsider;
    expect((await exportRequest(ids.event)).status).toBe(404);
    identity.id = users.owner;
    const response = await exportRequest(ids.event);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const csv = await response.text();
    const rows = csv.trim().split("\n");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Order,Placed at,Status");
    expect(csv).toContain("Razorpay · Visa •••• 4242");
    expect(csv).toContain(",400.00,");
    expect(await prisma.auditEvent.count({ where: { action: "ORDERS_EXPORTED", targetId: ids.event } })).toBe(1);
  });

  it("lists an event's orders over the API without buyer details, inside its own organisation only", async () => {
    const result = await listApiOrders(ids.organisation, ids.event, 2, null);
    expect(result?.data).toHaveLength(2);
    expect(result?.pagination.nextCursor).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("@example.test");
    expect(JSON.stringify(result)).not.toContain("pay_");
    const refunded = (await listApiOrders(ids.organisation, ids.event, 10, null))!.data.find((row) => row.refunded !== "0.00");
    expect(refunded).toMatchObject({ currency: "INR", total: "1000.00", paid: "1000.00", refunded: "400.00" });
    await expect(listApiOrders(ids.organisation, ids.otherEvent, 10, null)).resolves.toBeNull();
  });
});
