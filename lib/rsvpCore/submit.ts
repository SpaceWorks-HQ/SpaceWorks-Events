import { EventPrivacyType, EventStatus, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isValidAttendeeName, rsvpGuestSchema, rsvpLoggedInSchema } from "@/lib/validators";
import type { ActionResult } from "@/app/actions/org";
import { flattenZodErrors } from "@/app/actions/utils";
import { isRegistrationClosed } from "@/lib/registrationCutoff";
import { validateAndNormalizeAnswers } from "./answers";
import { submitInstanceRsvp } from "./instance";
import { sellsTickets, submitTicketOrder } from "./orders";
import { reserveRsvp } from "./reserve";
import { isRsvpTargetClosedError, normalizeGuestEmail, resolveAttendeeEmail } from "./shared";

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
