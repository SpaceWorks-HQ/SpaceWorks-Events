import type { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { eventBroadcastDraftRefSchema, saveEventBroadcastDraftSchema } from "@/lib/validators";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { sanitizeBroadcastHtml } from "@/lib/eventBroadcast";
import { DEFAULT_BROADCAST_DESIGN, isBroadcastDesign } from "@/lib/email/broadcastDesigns";
import type { EventBroadcastDraftDto } from "@/lib/broadcastDraftAutosave";
import type { ActionResult } from "../org";
import { flattenZodErrors } from "../utils";
import { requireBroadcastContext } from "./context";

/*
 * Drafts: one private, autosaved composer state per organiser and event.
 * Access is exactly the composer's (requireBroadcastContext). Every query is
 * keyed by the signed-in user, so an organiser never reads or changes a
 * teammate's draft. Autosaves are not audited: a draft reaches nobody, holds
 * only what its author typed, and the send that uses it is audited.
 */

const draftSelect = { subject: true, body: true, design: true, statuses: true, attendance: true, templateId: true, updatedAt: true } as const;

function invalidDraftInput(error: ZodError) {
  const fieldErrors = flattenZodErrors(error);
  return { ok: false as const, error: fieldErrors.subject?.[0] ?? fieldErrors.body?.[0] ?? "Invalid draft.", fieldErrors };
}

/** The organiser's saved draft for the event, or null. Read-only, so not rate limited (like the recipient count). */
export async function loadEventBroadcastDraftForUser(userId: string | null, input: unknown): Promise<ActionResult<{ draft: EventBroadcastDraftDto | null; }>> {
  if (!userId) return { ok: false, error: "You must be signed in." };
  const parsed = eventBroadcastDraftRefSchema.safeParse(input);
  if (!parsed.success) return invalidDraftInput(parsed.error);

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };

  const row = await prisma.eventBroadcastDraft.findUnique({
    where: { eventId_userId: { eventId: context.event.id, userId } },
    select: draftSelect,
  });
  if (!row) return { ok: true, data: { draft: null } };
  return {
    ok: true,
    data: {
      draft: {
        subject: row.subject,
        body: row.body,
        design: isBroadcastDesign(row.design) ? row.design : DEFAULT_BROADCAST_DESIGN,
        statuses: row.statuses,
        attendance: row.attendance,
        templateId: row.templateId,
        updatedAt: row.updatedAt.toISOString(),
      },
    },
  };
}

/** Creates or replaces the organiser's draft. The body is sanitised exactly as on send. */
export async function saveEventBroadcastDraftForUser(userId: string | null, input: unknown): Promise<ActionResult<{ updatedAt: string; }>> {
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("broadcastDraft", userId)) {
    return { ok: false, error: "Saving too often. Your draft will be saved again in a moment." };
  }
  const parsed = saveEventBroadcastDraftSchema.safeParse(input);
  if (!parsed.success) return invalidDraftInput(parsed.error);

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };

  const content = {
    subject: parsed.data.subject,
    body: sanitizeBroadcastHtml(parsed.data.body),
    design: parsed.data.design,
    statuses: parsed.data.statuses,
    attendance: parsed.data.attendance,
    templateId: parsed.data.templateId,
  };
  try {
    const saved = await prisma.eventBroadcastDraft.upsert({
      where: { eventId_userId: { eventId: context.event.id, userId } },
      create: { eventId: context.event.id, userId, ...content },
      update: content,
      select: { updatedAt: true },
    });
    return { ok: true, data: { updatedAt: saved.updatedAt.toISOString() } };
  } catch {
    console.error("[event broadcast] draft save failed");
    return { ok: false, error: "Could not save the draft. Please try again." };
  }
}

/** Deletes the organiser's own draft; discarding a draft that is already gone succeeds. */
export async function discardEventBroadcastDraftForUser(userId: string | null, input: unknown): Promise<ActionResult<{ discarded: boolean; }>> {
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("broadcastDraft", userId)) {
    return { ok: false, error: "Too many requests. Please wait a moment and try again." };
  }
  const parsed = eventBroadcastDraftRefSchema.safeParse(input);
  if (!parsed.success) return invalidDraftInput(parsed.error);

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };

  const result = await prisma.eventBroadcastDraft.deleteMany({ where: { eventId: context.event.id, userId } });
  return { ok: true, data: { discarded: result.count > 0 } };
}
