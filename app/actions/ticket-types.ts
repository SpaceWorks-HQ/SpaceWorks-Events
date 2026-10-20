"use server";

import { EventPrivacyType } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { DEFAULT_CURRENCY, formatMoney, parseMoneyToMinor, providerMinimumMinor } from "@/lib/payments/money";
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
 * Ticket types, prices and the refund policy belong to the organisation's
 * owners and admins, and to collaborators granted EDIT_DETAILS on this event.
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
    select: { id: true, slug: true, privacyType: true, currency: true },
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
    if (event.privacyType === EventPrivacyType.APPROVAL_REQUIRED) return { ok: false, error: "Paid tickets aren't available yet for events that need approval." };
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
