"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { DEFAULT_CURRENCY, formatMoney, parseMoneyToMinor, providerMinimumMinor } from "@/lib/payments/money";
import { isValidPromoCode, promoCodeDigest, promoCodeHint } from "@/lib/payments/promo";
import { isAtLeastAsGenerous, type RefundPolicySnapshot } from "@/lib/payments/refundPolicy";
import { configuredProvider } from "@/lib/payments/settings";
import { EventPermission } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessEvent } from "@/lib/eventAccess";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const MAX_TICKET_TYPES = 20;
const ZERO = BigInt(0);

const target = {
  organisationSlug: z.string().trim().min(1).max(120),
  eventId: z.string().trim().min(1).max(128),
};
const optionalDate = z.string().datetime().nullable().optional();
const saveSchema = z.object({
  ...target,
  ticketTypeId: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Give the ticket a name.").max(80),
  description: z.string().trim().max(500).default(""),
  /** Typed price in major units, e.g. "499" or "499.50"; blank or 0 is free. */
  price: z.string().trim().max(20).default(""),
  capacity: z.number().int().min(1).max(1_000_000).nullable().optional(),
  minPerOrder: z.number().int().min(1).max(100).default(1),
  maxPerOrder: z.number().int().min(1).max(100).default(10),
  salesStartAt: optionalDate,
  salesEndAt: optionalDate,
}).strict();
const archiveSchema = z.object({ ...target, ticketTypeId: z.string().trim().min(1).max(64) }).strict();

/**
 * Ticket types, prices, promo codes and the refund policy belong to the
 * organisation's owners and admins, and to collaborators granted
 * EDIT_DETAILS on this event.
 */
async function access(input: { organisationSlug: string; eventId: string; }) {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." } as const;
  const userId = session.user.id;
  const organisation = await prisma.organisation.findUnique({ where: { slug: input.organisationSlug }, select: { id: true, slug: true } });
  if (!organisation || !(await canAccessEvent({ userId, organisationId: organisation.id, eventId: input.eventId, permission: EventPermission.EDIT_DETAILS }))) {
    return { error: "You don't have permission to change this event's tickets." } as const;
  }
  if (await isActionRateLimited("action", userId)) return { error: "Too many ticket changes. Try again shortly." } as const;
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, organisationId: organisation.id },
    select: { id: true, slug: true, currency: true },
  });
  return event ? { organisation, userId, event } : { error: "Event not found." } as const;
}

function revalidateEvent(orgSlug: string, event: { id: string; slug: string; }) {
  revalidatePath(`/${orgSlug}/${event.slug}`);
  revalidatePath(`/dashboard/${orgSlug}/event/${event.id}`);
}

export async function saveTicketType(input: unknown): Promise<ActionResult<{ id: string; }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the ticket details." };
  const context = await access(parsed.data);
  if ("error" in context) return { ok: false, error: context.error ?? "Event not found." };
  const { organisation, userId, event } = context;
  const data = parsed.data;

  const existing = data.ticketTypeId
    ? await prisma.ticketType.findFirst({ where: { id: data.ticketTypeId, eventId: event.id, archivedAt: null }, select: { id: true } })
    : null;
  if (data.ticketTypeId && !existing) return { ok: false, error: "That ticket no longer exists." };

  const settings = await prisma.organisationPaymentSettings.findUnique({ where: { organisationId: organisation.id } });
  // One currency per event: set with its first ticket and never changed after,
  // so every ticket, order and refund of the event agrees.
  const currency = event.currency ?? settings?.currency ?? DEFAULT_CURRENCY;
  const priceMinor = data.price ? parseMoneyToMinor(data.price, currency) : ZERO;
  if (priceMinor === null) return { ok: false, error: `Enter the price in ${currency}, for example 499 or 499.50.` };

  if (priceMinor > ZERO) {
    if (!(await isPaidEventsEnabled())) return { ok: false, error: "Paid tickets are turned off on this installation." };
    const provider = configuredProvider(settings);
    if (!provider) return { ok: false, error: "Connect a payment account in Settings → Payments before adding a paid ticket." };
    const minimum = providerMinimumMinor(provider, currency);
    if (priceMinor < minimum) return { ok: false, error: `The smallest price ${provider === "RAZORPAY" ? "Razorpay" : "Stripe"} accepts is ${formatMoney(minimum, currency)}.` };
  }
  if (data.maxPerOrder < data.minPerOrder) return { ok: false, error: "The most per order can't be below the fewest." };
  const salesStartAt = data.salesStartAt ? new Date(data.salesStartAt) : null;
  const salesEndAt = data.salesEndAt ? new Date(data.salesEndAt) : null;
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) return { ok: false, error: "Sales must end after they start." };

  const values = {
    name: data.name,
    description: data.description,
    priceMinor,
    capacity: data.capacity ?? null,
    minPerOrder: data.minPerOrder,
    maxPerOrder: data.maxPerOrder,
    salesStartAt,
    salesEndAt,
  };
  const saved = await prisma.$transaction(async (tx) => {
    let id: string;
    if (existing) {
      // Registrations keep the price they were quoted; only new ones change.
      await tx.ticketType.update({ where: { id: existing.id }, data: values });
      id = existing.id;
    } else {
      if (await tx.ticketType.count({ where: { eventId: event.id, archivedAt: null } }) >= MAX_TICKET_TYPES) return null;
      const last = await tx.ticketType.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      id = (await tx.ticketType.create({ data: { ...values, eventId: event.id, sortOrder: (last?.sortOrder ?? -1) + 1 }, select: { id: true } })).id;
      if (!event.currency) await tx.event.update({ where: { id: event.id }, data: { currency } });
    }
    await recordAuditEvent({
      action: existing ? "TICKET_TYPE_UPDATED" : "TICKET_TYPE_CREATED",
      actorUserId: userId,
      organisationId: organisation.id,
      targetType: "TicketType",
      targetId: id,
      metadata: { paid: priceMinor > ZERO, limited: values.capacity != null },
      client: tx,
    });
    return id;
  });
  if (!saved) return { ok: false, error: `An event can have up to ${MAX_TICKET_TYPES} tickets.` };
  revalidateEvent(organisation.slug, event);
  return { ok: true, data: { id: saved } };
}

/** Takes a ticket off sale. Registrations keep it; it is never deleted. */
export async function archiveTicketType(input: unknown): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a ticket." };
  const context = await access(parsed.data);
  if ("error" in context) return { ok: false, error: context.error ?? "Event not found." };
  const archived = await prisma.ticketType.updateMany({
    where: { id: parsed.data.ticketTypeId, eventId: context.event.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (archived.count !== 1) return { ok: false, error: "That ticket no longer exists." };
  await recordAuditEvent({ action: "TICKET_TYPE_ARCHIVED", actorUserId: context.userId, organisationId: context.organisation.id, targetType: "TicketType", targetId: parsed.data.ticketTypeId });
  revalidateEvent(context.organisation.slug, context.event);
  return { ok: true };
}

const promoSchema = z.object({
  ...target,
  code: z.string().trim().min(3, "Codes are 3 to 32 letters, numbers, - or _.").max(32, "Codes are 3 to 32 letters, numbers, - or _."),
  kind: z.enum(["PERCENT", "FIXED"]),
  appliesPer: z.enum(["TICKET", "ORDER"]).default("TICKET"),
  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  /** Typed amount in major units, for a fixed discount. */
  amountOff: z.string().trim().max(20).optional(),
  ticketTypeId: z.string().trim().min(1).max(64).nullable().optional(),
  minQuantity: z.number().int().min(1).max(100).default(1),
  perOrderLimit: z.number().int().min(1).max(100).nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  validFrom: optionalDate,
  validUntil: optionalDate,
}).strict();
const archivePromoSchema = z.object({ ...target, promoCodeId: z.string().trim().min(1).max(64) }).strict();

/**
 * Create a promo code. Only a digest of the code is stored, with a short
 * hint; a code is never edited, only archived and replaced.
 */
export async function createPromoCode(input: unknown): Promise<ActionResult<{ id: string; }>> {
  const parsed = promoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the promo code." };
  const context = await access(parsed.data);
  if ("error" in context) return { ok: false, error: context.error ?? "Event not found." };
  const { organisation, userId, event } = context;
  const data = parsed.data;
  if (!isValidPromoCode(data.code)) return { ok: false, error: "Codes are 3 to 32 letters, numbers, - or _." };
  if (!event.currency) return { ok: false, error: "Add a paid ticket before creating promo codes." };
  let amountOffMinor: bigint | null = null;
  if (data.kind === "FIXED") {
    amountOffMinor = data.amountOff ? parseMoneyToMinor(data.amountOff, event.currency) : null;
    if (!amountOffMinor || amountOffMinor <= ZERO) return { ok: false, error: `Enter the discount in ${event.currency}, for example 100.` };
  } else if (!data.percentOff) {
    return { ok: false, error: "Enter a percentage from 1 to 100." };
  }
  if (data.ticketTypeId && !(await prisma.ticketType.findFirst({ where: { id: data.ticketTypeId, eventId: event.id, archivedAt: null }, select: { id: true } }))) {
    return { ok: false, error: "That ticket no longer exists." };
  }
  const validFrom = data.validFrom ? new Date(data.validFrom) : null;
  const validUntil = data.validUntil ? new Date(data.validUntil) : null;
  if (validFrom && validUntil && validUntil <= validFrom) return { ok: false, error: "The code must stop working after it starts." };
  try {
    const created = await prisma.promoCode.create({
      data: {
        eventId: event.id, codeDigest: promoCodeDigest(data.code), hint: promoCodeHint(data.code), kind: data.kind, appliesPer: data.appliesPer,
        percentOff: data.kind === "PERCENT" ? data.percentOff : null, amountOffMinor, ticketTypeId: data.ticketTypeId ?? null,
        minQuantity: data.minQuantity, perOrderLimit: data.appliesPer === "TICKET" ? data.perOrderLimit ?? null : null, maxRedemptions: data.maxRedemptions ?? null,
        validFrom, validUntil, createdByUserId: userId,
      },
      select: { id: true },
    });
    await recordAuditEvent({ action: "PROMO_CODE_CREATED", actorUserId: userId, organisationId: organisation.id, targetType: "PromoCode", targetId: created.id, metadata: { kind: data.kind, appliesPer: data.appliesPer } });
    revalidateEvent(organisation.slug, event);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") return { ok: false, error: "This event already has that code." };
    throw error;
  }
}

/** Stops a code working. Orders that used it keep their price. */
export async function archivePromoCode(input: unknown): Promise<ActionResult> {
  const parsed = archivePromoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a promo code." };
  const context = await access(parsed.data);
  if ("error" in context) return { ok: false, error: context.error ?? "Event not found." };
  const archived = await prisma.promoCode.updateMany({ where: { id: parsed.data.promoCodeId, eventId: context.event.id, archivedAt: null }, data: { archivedAt: new Date() } });
  if (archived.count !== 1) return { ok: false, error: "That code is already off." };
  await recordAuditEvent({ action: "PROMO_CODE_ARCHIVED", actorUserId: context.userId, organisationId: context.organisation.id, targetType: "PromoCode", targetId: parsed.data.promoCodeId });
  revalidateEvent(context.organisation.slug, context.event);
  return { ok: true };
}

const refundPolicySchema = z.object({
  ...target,
  kind: z.enum(["NONE", "FULL_UNTIL", "PERCENT_UNTIL"]),
  hours: z.number().int().min(0).max(8760).nullable().optional(),
  percent: z.number().int().min(1).max(99).nullable().optional(),
  text: z.string().trim().max(1000).default(""),
}).strict();

/**
 * Set when buyers may cancel for a refund. Each order keeps the policy it
 * was sold under; once any paid order exists the policy may only become
 * more generous, so what was advertised is never taken back.
 */
export async function saveRefundPolicy(input: unknown): Promise<ActionResult> {
  const parsed = refundPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the refund policy." };
  const context = await access(parsed.data);
  if ("error" in context) return { ok: false, error: context.error ?? "Event not found." };
  const data = parsed.data;
  const next: RefundPolicySnapshot = {
    kind: data.kind,
    hours: data.kind === "NONE" ? null : data.hours ?? null,
    percent: data.kind === "PERCENT_UNTIL" ? data.percent ?? null : null,
    text: data.text,
  };
  if (next.kind !== "NONE" && next.hours == null) return { ok: false, error: "Say how long before the event refunds stop." };
  if (next.kind === "PERCENT_UNTIL" && next.percent == null) return { ok: false, error: "Enter the refund percentage, from 1 to 99." };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${context.event.id} FOR UPDATE`;
    const current = await tx.event.findUniqueOrThrow({ where: { id: context.event.id }, select: { refundPolicyKind: true, refundPolicyHours: true, refundPolicyPercent: true, refundPolicyText: true } });
    const sold = await tx.order.count({ where: { eventId: context.event.id, totalMinor: { gt: 0 } } });
    const previous: RefundPolicySnapshot = { kind: current.refundPolicyKind, hours: current.refundPolicyHours, percent: current.refundPolicyPercent, text: current.refundPolicyText };
    if (sold > 0 && !isAtLeastAsGenerous(next, previous)) return "stricter" as const;
    await tx.event.update({ where: { id: context.event.id }, data: { refundPolicyKind: next.kind, refundPolicyHours: next.hours, refundPolicyPercent: next.percent, refundPolicyText: next.text } });
    await recordAuditEvent({ action: "REFUND_POLICY_UPDATED", actorUserId: context.userId, organisationId: context.organisation.id, targetType: "Event", targetId: context.event.id, metadata: { kind: next.kind }, client: tx });
    return "saved" as const;
  });
  if (result === "stricter") return { ok: false, error: "Tickets have been sold, so the refund policy can only become more generous." };
  revalidateEvent(context.organisation.slug, context.event);
  return { ok: true };
}
