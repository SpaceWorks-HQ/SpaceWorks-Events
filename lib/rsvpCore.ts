import {
  EventPrivacyType,
  EventStatus,
  OfflinePaymentMethod,
  Prisma,
  RegistrationFieldType,
  RsvpStatus,
  TicketTypeKind,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_MAX_LENGTH, OTHER_MAX_LENGTH, parseFieldSettings, visibleFieldKeys } from "@/lib/registrationFields";
import {
  isValidAttendeeName,
  manualRsvpSchema,
  rsvpGuestSchema,
  rsvpLoggedInSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/app/actions/org";
import { flattenZodErrors } from "@/app/actions/utils";
import { enqueueRsvpConfirmation } from "@/lib/outbox";
import { noticeOrganisersOfRequest } from "@/lib/notices";
import { isRegistrationClosed } from "@/lib/registrationCutoff";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { recordAuditEvent } from "@/lib/audit";
import { startCheckout } from "@/lib/payments/checkout";
import { seatTakingWhere } from "@/lib/payments/holds";
import { OrderError, reserveOrder, type OrderAttendee, type PaymentContext } from "@/lib/payments/orders";
import { lockSeriesDates, type OrderTarget } from "@/lib/payments/targets";
import { loadPaymentAccount } from "@/lib/payments/settings";
import {
  isValidInternationalPhone,
  normalizeInternationalPhone,
  phoneValidationMessage,
} from "@/lib/phone";

function normalizeGuestEmail(email: string) {
  return email.trim().toLowerCase();
}

class RsvpTargetClosedError extends Error {}

function isRsvpTargetClosedError(error: unknown): error is RsvpTargetClosedError {
  return error instanceof RsvpTargetClosedError;
}

type AnswerRow = { fieldId: string; valueText?: string | null; valueBool?: boolean | null; valueNumber?: number | null; valueDate?: Date | null; };

type OrderRequest = {
  items?: Array<{ ticketTypeId: string; quantity: number; amountMinor?: number | null; }>;
  ticketTypeId?: string;
  attendees?: OrderAttendee[];
  promoCode?: string;
  accessCode?: string;
  addOns?: Array<{ addOnId: string; quantity: number; }>;
  payAtDesk?: boolean;
};

function requestedItems(request: OrderRequest) {
  if (request.items?.length) return request.items;
  return request.ticketTypeId ? [{ ticketTypeId: request.ticketTypeId, quantity: 1 }] : [];
}

/**
 * Who collects the order if it costs money: the organisation's connected
 * account, while paid events are on for this installation. Whether it costs
 * anything is only known once priced (a chosen amount, a fee, an add-on), so
 * the account is resolved for any ticket order. Undefined otherwise; the
 * reservation then refuses a paid order and still takes a free one.
 */
async function paymentContextFor(organisationId: string, items: Array<{ ticketTypeId: string; }>): Promise<PaymentContext | undefined> {
  if (items.length === 0 || !(await isPaidEventsEnabled())) return undefined;
  const account = await loadPaymentAccount(organisationId);
  return account ? { organisationId, provider: account.provider, testMode: account.testMode } : undefined;
}

/**
 * Registration for an event or series that sells ticket types: one order,
 * one registration per ticket (per date, for a pass), priced and seated
 * under the event's or series's locks. The buyer's answers go on their own
 * (first) ticket. A paid order then opens the provider's checkout, outside
 * the transaction.
 */
async function submitTicketOrder(params: {
  target: OrderTarget;
  organisationId: string;
  request: OrderRequest;
  buyer: { userId: string | null; email: string; name: string; attendeeKey: string; };
  answers: AnswerRow[];
  setUserName?: string | null;
}): Promise<ActionResult<{ count: number; status: RsvpStatus; ticketToken: string; orderToken: string; checkoutUrl: string | null }>> {
  const items = requestedItems(params.request);
  if (items.length === 0) return { ok: false, error: "Choose a ticket." };
  try {
    // Paying at the desk needs no online account: it's recorded in person.
    const payment = params.request.payAtDesk
      ? (await isPaidEventsEnabled() ? { organisationId: params.organisationId, provider: "OFFLINE" as const, testMode: false } : undefined)
      : await paymentContextFor(params.organisationId, items);
    const order = await prisma.$transaction(async (tx) => {
      const reserved = await reserveOrder(tx, {
        target: params.target,
        items,
        buyer: params.buyer,
        attendees: params.request.attendees ?? [],
        enforceOpen: true,
        payment,
        promoCode: params.request.promoCode || undefined,
        accessCode: params.request.accessCode || undefined,
        addOns: params.request.addOns,
        payAtDesk: params.request.payAtDesk,
      });
      if (params.setUserName && params.buyer.userId) await tx.user.update({ where: { id: params.buyer.userId }, data: { name: params.setUserName } });
      if (params.answers.length > 0) {
        await tx.rsvpAnswer.createMany({
          data: params.answers.map((row) => ({ rsvpId: reserved.buyerRsvpId, fieldId: row.fieldId, valueText: row.valueText ?? null, valueBool: row.valueBool ?? null, valueNumber: row.valueNumber ?? null, valueDate: row.valueDate ?? null })),
        });
      }
      return reserved;
    });
    const checkout = order.paymentId ? await startCheckout(order.orderId).catch(() => null) : null;
    return {
      ok: true,
      data: {
        count: order.count,
        status: order.status,
        ticketToken: order.buyerTicketToken,
        orderToken: order.accessToken,
        checkoutUrl: checkout && "url" in checkout ? checkout.url : null,
      },
    };
  } catch (error: unknown) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      return { ok: false, error: "Someone on this order is already registered for this event." };
    }
    console.error("[rsvp] ticket order failed");
    return { ok: false, error: "Could not save your order." };
  }
}

/** Events and series with active ticket types register through orders. */
async function sellsTickets(owner: { eventId: string; } | { eventSeriesId: string; }) {
  return (await prisma.ticketType.count({ where: { ...owner, archivedAt: null } })) > 0;
}

/**
 * A series order is for one date or for passes, never both: the chosen
 * ticket types decide which.
 */
async function seriesOrderTarget(seriesId: string, eventInstanceId: string, items: Array<{ ticketTypeId: string; }>): Promise<OrderTarget | { error: string; }> {
  const passes = await prisma.ticketType.count({ where: { eventSeriesId: seriesId, id: { in: items.map((item) => item.ticketTypeId) }, kind: TicketTypeKind.PASS } });
  if (passes === 0) return { eventInstanceId };
  if (passes < new Set(items.map((item) => item.ticketTypeId)).size) return { error: "Buy passes and single dates in separate orders." };
  return { passSeriesId: seriesId };
}

export function decideRsvpStatus(params: {
  capacity: number | null;
  confirmedCount: number;
  privacyType: EventPrivacyType;
}): RsvpStatus {
  const { capacity, confirmedCount, privacyType } = params;
  const full = capacity != null && confirmedCount >= capacity;

  if (privacyType === EventPrivacyType.APPROVAL_REQUIRED) {
    return RsvpStatus.PENDING_APPROVAL;
  }
  if (full) {
    return RsvpStatus.WAITLISTED;
  }
  return RsvpStatus.CONFIRMED;
}

type RsvpTarget = { eventId: string } | { eventInstanceId: string };

/**
 * Locks the event/occurrence row before counting confirmed attendees. This
 * serializes admissions for a capacity while retaining a database constraint
 * as the final duplicate-registration guard.
 */
async function reserveRsvp(params: {
  target: RsvpTarget;
  capacity: number | null;
  privacyType: EventPrivacyType;
  data: Omit<Prisma.RSVPUncheckedCreateInput, "status">;
  notification: { to: string; eventTitle: string };
  afterCreate?: (tx: Prisma.TransactionClient, rsvpId: string) => Promise<void>;
  enforceOpen?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    let capacity = params.capacity;
    let privacyType = params.privacyType;
    if ("eventId" in params.target) {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${params.target.eventId} FOR UPDATE`;
      const current = await tx.event.findUnique({
        where: { id: params.target.eventId },
        select: { capacity: true, privacyType: true, status: true, endDateTime: true, registrationClosesAt: true, registrationLeadMinutes: true, startDateTime: true, page: { select: { isPublished: true } } },
      });
      if (!current) throw new RsvpTargetClosedError();
      if (params.enforceOpen !== false && (current.status !== EventStatus.PUBLISHED || current.page?.isPublished !== true || current.endDateTime <= new Date() || isRegistrationClosed(current))) throw new RsvpTargetClosedError();
      capacity = current.capacity;
      privacyType = current.privacyType;
    } else {
      // The series row, then the date: the same order every series path locks in.
      const date = await tx.eventInstance.findUnique({ where: { id: params.target.eventInstanceId }, select: { eventSeriesId: true } });
      if (!date) throw new RsvpTargetClosedError();
      await lockSeriesDates(tx, date.eventSeriesId, [params.target.eventInstanceId], new Date());
      const current = await tx.eventInstance.findUnique({ where: { id: params.target.eventInstanceId }, select: { endDateTime: true, capacity: true, cancelledAt: true, series: { select: { capacity: true, privacyType: true, status: true } } } });
      if (!current) throw new RsvpTargetClosedError();
      if (params.enforceOpen !== false && (current.series.status !== EventStatus.PUBLISHED || current.endDateTime <= new Date() || current.cancelledAt)) throw new RsvpTargetClosedError();
      capacity = current.capacity ?? current.series.capacity;
      privacyType = current.series.privacyType;
    }

    // Paid tickets still being paid for hold their seats too.
    const confirmedCount = await tx.rSVP.count({
      where: {
        ...params.target,
        ...seatTakingWhere(new Date()),
      },
    });
    const status = decideRsvpStatus({
      capacity,
      confirmedCount,
      privacyType,
    });
    const rsvp = await tx.rSVP.create({
      data: { ...params.data, status },
      select: { id: true, checkInToken: true },
    });
    await enqueueRsvpConfirmation(tx, {
      to: params.notification.to,
      eventTitle: params.notification.eventTitle,
      status,
      checkInToken: rsvp.checkInToken,
    });
    if (status === RsvpStatus.PENDING_APPROVAL) await noticeOrganisersOfRequest(tx, params.target);
    await params.afterCreate?.(tx, rsvp.id);
    const count = await tx.rSVP.count({ where: params.target });
    return { ...rsvp, status, count };
  });
}

async function resolveAttendeeEmail(
  userId: string | null,
  guestEmail: string | undefined,
): Promise<{ email: string } | { error: string }> {
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email?.trim()) {
      return {
        error:
          "Your account needs an email address to RSVP to this event. Update your profile or use the guest form.",
      };
    }
    return { email: normalizeGuestEmail(user.email) };
  }
  if (guestEmail) {
    return { email: normalizeGuestEmail(guestEmail) };
  }
  return { error: "Email is required." };
}

function optionsFromJson(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEmailBasic(v: string) {
  return v.trim().toLowerCase();
}

function isBasicEmail(v: string) {
  // Simple sanity check; not RFC-perfect by design.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function coerceFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function validateAndNormalizeAnswers(params: {
  fields: Array<{
    id: string;
    key: string;
    label: string;
    type: RegistrationFieldType;
    required: boolean;
    options: unknown;
    /** FieldSettings JSON (lib/registrationFields.ts); invalid values are ignored. */
    settings?: unknown;
  }>;
  answers: Record<string, unknown>;
}): { rows: Array<{
  fieldId: string;
  valueText?: string | null;
  valueBool?: boolean | null;
  valueNumber?: number | null;
  valueDate?: Date | null;
}> } | { error: string } {
  const { fields, answers } = params;

  const rows: Array<{
    fieldId: string;
    valueText?: string | null;
    valueBool?: boolean | null;
    valueNumber?: number | null;
    valueDate?: Date | null;
  }> = [];

  const settingsByKey = new Map(fields.map((f) => [f.key, parseFieldSettings(f.settings)]));
  // Questions hidden by "show only if" are skipped entirely: never required, answers dropped.
  const visible = visibleFieldKeys(
    fields.map((f) => ({ key: f.key, type: f.type, settings: settingsByKey.get(f.key) })),
    answers,
  );

  for (const f of fields) {
    if (!visible.has(f.key)) continue;
    const settings = settingsByKey.get(f.key) ?? {};
    const raw = answers[f.key];
    const hasValue = raw !== undefined && raw !== null && raw !== "";

    switch (f.type) {
      case RegistrationFieldType.TEXT:
      case RegistrationFieldType.TEXTAREA: {
        const s = typeof raw === "string" ? raw.trim() : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        const max = Math.min(settings.maxLength ?? DEFAULT_MAX_LENGTH[f.type]!, 5_000);
        if (s.length > max) return { error: `${f.label} must be at most ${max.toLocaleString("en-GB")} characters.` };
        if (settings.minLength != null && s.length < settings.minLength) return { error: `${f.label} must be at least ${settings.minLength} characters.` };
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.EMAIL: {
        const s = typeof raw === "string" ? normalizeEmailBasic(raw) : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        if (!isBasicEmail(s)) return { error: `${f.label} must be a valid email.` };
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.PHONE: {
        const s = typeof raw === "string" ? normalizeInternationalPhone(raw) : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        if (!isValidInternationalPhone(s)) {
          return { error: phoneValidationMessage(f.label, s) };
        }
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.SELECT:
      case RegistrationFieldType.RADIO: {
        const opts = optionsFromJson(f.options);
        const s = typeof raw === "string" ? raw.trim() : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        if (opts.length > 0 && !opts.includes(s)) {
          if (!settings.allowOther) return { error: `${f.label} must be one of the available options.` };
          if (s.length > OTHER_MAX_LENGTH) return { error: `${f.label}: keep "Other" under ${OTHER_MAX_LENGTH} characters.` };
        }
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.MULTI_SELECT: {
        const opts = optionsFromJson(f.options);
        const arr =
          Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
        const picked = arr.map((s) => s.trim()).filter(Boolean);
        if (f.required && picked.length === 0) {
          return { error: `${f.label} is required.` };
        }
        const unique = [...new Set(picked)];
        if (settings.maxSelections != null && unique.length > settings.maxSelections) {
          return { error: `${f.label}: choose up to ${settings.maxSelections}.` };
        }
        const others = unique.filter((s) => opts.length > 0 && !opts.includes(s));
        if (others.length > 0 && (!settings.allowOther || others.length > 1)) {
          return { error: `${f.label} contains an invalid option.` };
        }
        if (others.some((s) => s.length > OTHER_MAX_LENGTH)) return { error: `${f.label}: keep "Other" under ${OTHER_MAX_LENGTH} characters.` };
        for (const s of unique) {
          rows.push({ fieldId: f.id, valueText: s });
        }
        break;
      }
      case RegistrationFieldType.CHECKBOX: {
        const b = typeof raw === "boolean" ? raw : raw === "on" ? true : false;
        if (f.required && !b) return { error: `${f.label} must be checked.` };
        if (hasValue) rows.push({ fieldId: f.id, valueBool: b });
        break;
      }
      case RegistrationFieldType.NUMBER: {
        if (!hasValue) {
          if (f.required) return { error: `${f.label} is required.` };
          break;
        }
        const n = coerceFiniteNumber(raw);
        if (n === null) return { error: `${f.label} must be a number.` };
        if (settings.min != null && n < settings.min) return { error: `${f.label} must be ${settings.min} or more.` };
        if (settings.max != null && n > settings.max) return { error: `${f.label} must be ${settings.max} or less.` };
        rows.push({ fieldId: f.id, valueNumber: n });
        break;
      }
      case RegistrationFieldType.DATE: {
        if (!hasValue) {
          if (f.required) return { error: `${f.label} is required.` };
          break;
        }
        const d = coerceDate(raw);
        if (!d) return { error: `${f.label} must be a valid date.` };
        const day = d.toISOString().slice(0, 10);
        if (settings.minDate && day < settings.minDate) return { error: `${f.label} can't be before ${settings.minDate}.` };
        if (settings.maxDate && day > settings.maxDate) return { error: `${f.label} can't be after ${settings.maxDate}.` };
        rows.push({ fieldId: f.id, valueDate: d });
        break;
      }
      default: {
        return { error: "Unsupported field type." };
      }
    }
  }

  return { rows };
}

export async function submitRsvpCore(
  input: unknown,
  opts: { userId: string | null },
): Promise<ActionResult<{ count: number; status: RsvpStatus; ticketToken: string; orderToken?: string; checkoutUrl?: string | null }>> {
  const userId = opts.userId;

  if (userId) {
    const parsed = rsvpLoggedInSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Invalid input.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }
    const { orgSlug, eventSlug, eventInstanceId } = parsed.data;

    const org = await prisma.organisation.findUnique({
      where: { slug: orgSlug },
    });
    if (!org) return { ok: false, error: "Event not found." };

    if (eventInstanceId) {
      return submitInstanceRsvp({
        org,
        eventInstanceId,
        userId,
        guestEmail: null,
        name: parsed.data.name ?? null,
        request: parsed.data,
      });
    }

    if (!eventSlug) {
      return { ok: false, error: "Event not found." };
    }

    const event = await prisma.event.findUnique({
      where: {
        organisationId_slug: { organisationId: org.id, slug: eventSlug },
      },
      include: { page: { select: { isPublished: true } } },
    });
    if (
      !event ||
      event.status !== EventStatus.PUBLISHED ||
      event.page?.isPublished !== true ||
      event.endDateTime <= new Date() ||
      isRegistrationClosed(event)
    ) {
      return { ok: false, error: "This event is not open for RSVP." };
    }

    const emailRes = await resolveAttendeeEmail(userId, undefined);
    if ("error" in emailRes) return { ok: false, error: emailRes.error };

    if (event.privacyType === EventPrivacyType.INVITE_ONLY) {
      const ok = await prisma.eventInvite.findUnique({
        where: {
          eventId_email: { eventId: event.id, email: emailRes.email },
        },
      });
      if (!ok) {
        return {
          ok: false,
          error: "This event is invite-only. Use the email you were invited with.",
        };
      }
    }

    const attendeeKey = `user:${userId}`;

    try {
      const form = await prisma.eventRegistrationForm.findUnique({
        where: { eventId: event.id },
        include: { fields: { orderBy: { sortOrder: "asc" } } },
      });
      const fields = form?.fields ?? [];

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const existingName = user?.name?.trim() ?? "";
      const submittedName =
        typeof parsed.data.name === "string" ? parsed.data.name.trim() : "";
      if (!existingName && !submittedName) {
        return { ok: false, error: "Name is required." };
      }
      if (!isValidAttendeeName(submittedName || existingName)) {
        return { ok: false, error: "Enter a valid name." };
      }

      const answers = parsed.data.answers ?? {};
      const validated = validateAndNormalizeAnswers({
        fields: fields.map((f) => ({
          id: f.id,
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options,
          settings: f.settings,
        })),
        answers: answers as Record<string, unknown>,
      });
      if ("error" in validated) return { ok: false, error: validated.error };

      if (await sellsTickets({ eventId: event.id })) {
        return submitTicketOrder({
          target: { eventId: event.id },
          organisationId: event.organisationId,
          request: parsed.data,
          buyer: { userId, email: emailRes.email, name: submittedName || existingName, attendeeKey },
          answers: validated.rows,
          setUserName: !existingName && submittedName ? submittedName : null,
        });
      }

      const reservation = await reserveRsvp({
        target: { eventId: event.id },
        capacity: event.capacity,
        privacyType: event.privacyType,
        notification: { to: emailRes.email, eventTitle: event.title },
        data: {
            eventId: event.id,
            userId,
            guestEmail: null,
            attendeeKey,
          },
        afterCreate: async (tx, rsvpId) => {
          if (!existingName && submittedName) {
            await tx.user.update({
            where: { id: userId },
            data: { name: submittedName },
          });
          }
          if (validated.rows.length > 0) {
            await tx.rsvpAnswer.createMany({
            data: validated.rows.map((row) => ({
              rsvpId,
              fieldId: row.fieldId,
              valueText: row.valueText ?? null,
              valueBool: row.valueBool ?? null,
              valueNumber: row.valueNumber ?? null,
              valueDate: row.valueDate ?? null,
            })),
          });
          }
        },
      });

      return {
        ok: true,
        data: { count: reservation.count, status: reservation.status, ticketToken: reservation.checkInToken },
      };
    } catch (e: unknown) {
      if (isRsvpTargetClosedError(e)) return { ok: false, error: "This event is not open for RSVP." };
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        return { ok: false, error: "You have already RSVP’d for this event." };
      }
      console.error("[rsvp] authenticated submission failed");
      return { ok: false, error: "Could not save your RSVP." };
    }
  }

  const parsed = rsvpGuestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { orgSlug, eventSlug, eventInstanceId, guestEmail } = parsed.data;
  const emailNorm = normalizeGuestEmail(guestEmail);

  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
  });
  if (!org) return { ok: false, error: "Event not found." };

  if (eventInstanceId) {
    return submitInstanceRsvp({
      org,
      eventInstanceId,
      userId: null,
      guestEmail: emailNorm,
      guestName: parsed.data.name,
      request: parsed.data,
    });
  }

  if (!eventSlug) {
    return { ok: false, error: "Event not found." };
  }

  const event = await prisma.event.findUnique({
    where: {
      organisationId_slug: { organisationId: org.id, slug: eventSlug },
    },
    include: { page: { select: { isPublished: true } } },
  });
  if (
    !event ||
    event.status !== EventStatus.PUBLISHED ||
    event.page?.isPublished !== true ||
    event.endDateTime <= new Date() ||
    isRegistrationClosed(event)
  ) {
    return { ok: false, error: "This event is not open for RSVP." };
  }

  if (event.privacyType === EventPrivacyType.INVITE_ONLY) {
    // A guest can assert any email address. Invite-only registration therefore
    // requires an authenticated account; do not issue bearer ticket tokens
    // solely because an entered address appears on an invite list.
    return { ok: false, error: "This event is invite-only. Sign in with the invited account to register." };
  }

  const attendeeKey = `guest:${emailNorm}`;

  try {
    const form = await prisma.eventRegistrationForm.findUnique({
      where: { eventId: event.id },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    });
    const fields = form?.fields ?? [];

    const validated = validateAndNormalizeAnswers({
      fields: fields.map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        settings: f.settings,
      })),
      answers: parsed.data.answers as Record<string, unknown>,
    });
    if ("error" in validated) return { ok: false, error: validated.error };

    if (await sellsTickets({ eventId: event.id })) {
      return submitTicketOrder({
        target: { eventId: event.id },
        organisationId: event.organisationId,
        request: parsed.data,
        buyer: { userId: null, email: emailNorm, name: parsed.data.name.trim(), attendeeKey },
        answers: validated.rows,
      });
    }

    const reservation = await reserveRsvp({
      target: { eventId: event.id },
      capacity: event.capacity,
      privacyType: event.privacyType,
      notification: { to: emailNorm, eventTitle: event.title },
      data: {
          eventId: event.id,
          userId: null,
          guestEmail: emailNorm,
          guestName: parsed.data.name.trim(),
          attendeeKey,
        },
      afterCreate: async (tx, rsvpId) => {
        if (validated.rows.length > 0) {
          await tx.rsvpAnswer.createMany({
          data: validated.rows.map((row) => ({
            rsvpId,
            fieldId: row.fieldId,
            valueText: row.valueText ?? null,
            valueBool: row.valueBool ?? null,
            valueNumber: row.valueNumber ?? null,
            valueDate: row.valueDate ?? null,
          })),
        });
        }
      },
    });

    return {
      ok: true,
      data: { count: reservation.count, status: reservation.status, ticketToken: reservation.checkInToken },
    };
  } catch (e: unknown) {
    if (isRsvpTargetClosedError(e)) return { ok: false, error: "This event is not open for RSVP." };
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: "This email is already registered for this event.",
      };
    }
    console.error("[rsvp] guest submission failed");
    return { ok: false, error: "Could not save your RSVP." };
  }
}

/**
 * Creates a guest RSVP on behalf of an authorised event administrator. Unlike
 * the public flow, this can register someone for a draft, ended, or invite-only
 * event; capacity, waitlist, approval, duplicate, form-answer, and ticket
 * rules remain owned by the same RSVP service.
 */
export async function submitManualGuestRsvpCore(
  input: unknown,
  opts: { organisationId: string },
): Promise<ActionResult<{ count: number; status: RsvpStatus; rsvpId: string }>> {
  const parsed = manualRsvpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const event = await prisma.event.findFirst({
    where: { id: parsed.data.eventId, organisationId: opts.organisationId },
  });
  if (!event) return { ok: false, error: "Event not found." };

  // Events that sell tickets add guests with a ticket (addTicketGuest).
  if (await sellsTickets({ eventId: event.id })) return { ok: false, error: "Choose a ticket for this guest." };

  const email = normalizeGuestEmail(parsed.data.guestEmail);
  const form = await prisma.eventRegistrationForm.findUnique({
    where: { eventId: event.id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  const validated = validateAndNormalizeAnswers({
    fields: (form?.fields ?? []).map((field) => ({
      id: field.id,
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options,
      settings: field.settings,
    })),
    answers: parsed.data.answers as Record<string, unknown>,
  });
  if ("error" in validated) return { ok: false, error: validated.error };

  try {
    const reservation = await reserveRsvp({
      target: { eventId: event.id },
      capacity: event.capacity,
      privacyType: event.privacyType,
      notification: { to: email, eventTitle: event.title },
      data: {
        eventId: event.id,
        userId: null,
        guestEmail: email,
        guestName: parsed.data.name.trim(),
        attendeeKey: `guest:${email}`,
      },
      enforceOpen: false,
      afterCreate: async (tx, rsvpId) => {
        if (validated.rows.length === 0) return;
        await tx.rsvpAnswer.createMany({
          data: validated.rows.map((row) => ({
            rsvpId,
            fieldId: row.fieldId,
            valueText: row.valueText ?? null,
            valueBool: row.valueBool ?? null,
            valueNumber: row.valueNumber ?? null,
            valueDate: row.valueDate ?? null,
          })),
        });
      },
    });
    return {
      ok: true,
      data: {
        count: reservation.count,
        status: reservation.status,
        rsvpId: reservation.id,
      },
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { ok: false, error: "This email is already registered for this event." };
    }
    console.error("[rsvp] manual submission failed");
    return { ok: false, error: "Could not save the attendee RSVP." };
  }
}

/**
 * An organiser adds a guest with a ticket. A paid ticket is settled one of
 * three ways: a payment link emailed with a day to pay, money collected in
 * person, or complimentary. Without an online account the last two still
 * work, recorded as offline payments.
 */
export async function submitManualTicketOrderCore(
  input: {
    eventId: string; name: string; guestEmail: string; ticketTypeId: string;
    payment: "link" | "offline" | "waive"; method?: OfflinePaymentMethod; reference?: string | null;
    answers: Record<string, unknown>;
  },
  opts: { organisationId: string; actorUserId: string; },
): Promise<ActionResult<{ status: RsvpStatus; orderId: string; }>> {
  const event = await prisma.event.findFirst({ where: { id: input.eventId, organisationId: opts.organisationId }, select: { id: true, organisationId: true } });
  if (!event) return { ok: false, error: "Event not found." };
  const email = normalizeGuestEmail(input.guestEmail);
  const form = await prisma.eventRegistrationForm.findUnique({ where: { eventId: event.id }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
  const validated = validateAndNormalizeAnswers({
    fields: (form?.fields ?? []).map((field) => ({ id: field.id, key: field.key, label: field.label, type: field.type, required: field.required, options: field.options, settings: field.settings })),
    answers: input.answers,
  });
  if ("error" in validated) return { ok: false, error: validated.error };
  const items = [{ ticketTypeId: input.ticketTypeId, quantity: 1 }];
  let payment = await paymentContextFor(event.organisationId, items);
  if (!payment && input.payment !== "link" && await isPaidEventsEnabled()) {
    payment = { organisationId: event.organisationId, provider: "OFFLINE", testMode: false };
  }
  try {
    const order = await prisma.$transaction(async (tx) => {
      const reserved = await reserveOrder(tx, {
        target: { eventId: event.id },
        items,
        buyer: { userId: null, email, name: input.name.trim(), attendeeKey: `guest:${email}` },
        attendees: [],
        enforceOpen: false,
        payment,
        manual: { mode: input.payment, method: input.method, reference: input.reference, actorUserId: opts.actorUserId },
      });
      if (validated.rows.length > 0) {
        await tx.rsvpAnswer.createMany({
          data: validated.rows.map((row) => ({ rsvpId: reserved.buyerRsvpId, fieldId: row.fieldId, valueText: row.valueText ?? null, valueBool: row.valueBool ?? null, valueNumber: row.valueNumber ?? null, valueDate: row.valueDate ?? null })),
        });
      }
      await recordAuditEvent({ action: "MANUAL_RSVP_CREATED", actorUserId: opts.actorUserId, organisationId: event.organisationId, targetType: "RSVP", targetId: reserved.buyerRsvpId, metadata: { eventId: event.id, status: reserved.status, payment: input.payment }, client: tx });
      return reserved;
    });
    return { ok: true, data: { status: order.status, orderId: order.orderId } };
  } catch (error: unknown) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      return { ok: false, error: "This email is already registered for this event." };
    }
    console.error("[rsvp] manual ticket order failed");
    return { ok: false, error: "Could not add the guest." };
  }
}

async function submitInstanceRsvp(params: {
  org: { id: string; slug: string };
  eventInstanceId: string;
  userId: string | null;
  guestEmail: string | null;
  guestName?: string | null;
  name?: string | null;
  request: OrderRequest;
}): Promise<ActionResult<{ count: number; status: RsvpStatus; ticketToken: string; orderToken?: string; checkoutUrl?: string | null }>> {
  const { org, eventInstanceId, userId } = params;

  const instance = await prisma.eventInstance.findFirst({
    where: { id: eventInstanceId },
    include: {
      series: true,
    },
  });
  if (!instance || instance.series.organisationId !== org.id) {
    return { ok: false, error: "Event not found." };
  }

  if (
    instance.series.status !== EventStatus.PUBLISHED ||
    instance.endDateTime <= new Date() ||
    instance.cancelledAt
  ) {
    return { ok: false, error: "This event is not open for RSVP." };
  }

  const series = instance.series;
  const emailRes = userId
    ? await resolveAttendeeEmail(userId, undefined)
    : { email: params.guestEmail! };

  if ("error" in emailRes) return { ok: false, error: emailRes.error };

  if (series.privacyType === EventPrivacyType.INVITE_ONLY) {
    if (!userId) {
      return { ok: false, error: "This event is invite-only. Sign in with the invited account to register." };
    }
    const ok = await prisma.seriesInvite.findUnique({
      where: {
        eventSeriesId_email: {
          eventSeriesId: series.id,
          email: emailRes.email,
        },
      },
    });
    if (!ok) {
      return {
        ok: false,
        error: "This event is invite-only. Use the email you were invited with.",
      };
    }
  }

  const attendeeKey = userId
    ? `user:${userId}`
    : `guest:${emailRes.email}`;

  // A series that sells tickets registers through orders, for one date or a pass.
  const items = requestedItems(params.request);
  if (items.length > 0 || await sellsTickets({ eventSeriesId: series.id })) {
    if (items.length === 0) return { ok: false, error: "Choose a ticket." };
    const target = await seriesOrderTarget(series.id, instance.id, items);
    if ("error" in target) return { ok: false, error: target.error };
    let name = params.guestName?.trim() ?? "";
    let setUserName: string | null = null;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const existingName = user?.name?.trim() ?? "";
      name = params.name?.trim() || existingName;
      if (!existingName && name) setUserName = name;
    }
    if (!name) return { ok: false, error: "Name is required." };
    if (!isValidAttendeeName(name)) return { ok: false, error: "Enter a valid name." };
    return submitTicketOrder({
      target,
      organisationId: series.organisationId,
      request: params.request,
      buyer: { userId, email: emailRes.email, name, attendeeKey },
      answers: [],
      setUserName,
    });
  }

  try {
    let reservation: Awaited<ReturnType<typeof reserveRsvp>>;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const existingName = user?.name?.trim() ?? "";
      const submittedName = params.name?.trim() ?? "";
      if (!existingName && !submittedName) {
        return { ok: false, error: "Name is required." };
      }
      if (!isValidAttendeeName(submittedName || existingName)) {
        return { ok: false, error: "Enter a valid name." };
      }

      reservation = await reserveRsvp({
        target: { eventInstanceId: instance.id },
        capacity: instance.capacity ?? series.capacity,
        privacyType: series.privacyType,
        notification: { to: emailRes.email, eventTitle: series.title },
        data: {
            eventInstanceId: instance.id,
            userId,
            guestEmail: null,
            attendeeKey,
          },
        afterCreate: async (tx) => {
          if (!existingName && submittedName) {
            await tx.user.update({
            where: { id: userId },
            data: { name: submittedName },
          });
          }
        },
      });
    } else {
      const guestName = params.guestName?.trim() ?? "";
      if (!guestName) return { ok: false, error: "Name is required." };
      if (!isValidAttendeeName(guestName)) {
        return { ok: false, error: "Enter a valid name." };
      }
      reservation = await reserveRsvp({
        target: { eventInstanceId: instance.id },
        capacity: instance.capacity ?? series.capacity,
        privacyType: series.privacyType,
        notification: { to: emailRes.email, eventTitle: series.title },
        data: {
          eventInstanceId: instance.id,
          userId: null,
          guestEmail: emailRes.email,
          guestName,
          attendeeKey,
        },
      });
    }

    return {
      ok: true,
      data: { count: reservation.count, status: reservation.status, ticketToken: reservation.checkInToken },
    };
  } catch (e: unknown) {
    if (isRsvpTargetClosedError(e)) return { ok: false, error: "This event is not open for RSVP." };
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { ok: false, error: "You have already RSVP’d for this event." };
    }
    console.error("[rsvp] occurrence submission failed");
    return { ok: false, error: "Could not save your RSVP." };
  }
}
