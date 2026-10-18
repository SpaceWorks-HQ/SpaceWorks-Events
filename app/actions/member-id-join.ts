"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MEMBER_NAME_MAX, validateFieldValues } from "@/lib/memberIds/core";
import { newVerifyToken } from "@/lib/memberIds/data";
import { approveMembers } from "@/lib/memberIds/issue";
import { storeMemberIdImage } from "@/lib/memberIds/uploads";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/*
 * The public join form. Joining needs a signed-in account (the card then
 * appears in the person's ID wallet), the programme must be active with
 * registration open, and requests are rate limited like RSVPs. One request
 * per email (and per account) per programme.
 */

export async function joinIdProgramme(formData: FormData): Promise<ActionResult<{ status: "PENDING" | "APPROVED"; }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in to request your card." };
  if (await isActionRateLimited("rsvp", userId)) return { ok: false, error: "Too many requests. Please try again shortly." };

  const organisationSlug = String(formData.get("organisationSlug") ?? "").slice(0, 120);
  const programmeSlug = String(formData.get("programmeSlug") ?? "").slice(0, 120);
  const programme = await prisma.idProgramme.findFirst({
    where: { slug: programmeSlug, organisation: { slug: organisationSlug } },
    select: {
      id: true, organisationId: true, status: true, registrationOpen: true, requiresApproval: true, idPrefix: true, validUntil: true, validityDays: true,
      fields: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { key: true, label: true, type: true, required: true, options: true } },
    },
  });
  if (!programme || programme.status !== "ACTIVE" || !programme.registrationOpen) return { ok: false, error: "This programme isn't taking requests right now." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const email = user?.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "Your account needs an email address to request a card." };
  const name = String(formData.get("name") ?? "").trim().slice(0, MEMBER_NAME_MAX);
  if (!name) return { ok: false, error: "Enter your name as it should appear on the card." };

  const raw: Record<string, unknown> = {};
  for (const field of programme.fields) raw[field.key] = formData.get(`field:${field.key}`);
  const checked = validateFieldValues(programme.fields, raw);
  if (!checked.ok) return { ok: false, error: checked.error };

  const existing = await prisma.idMember.findFirst({ where: { programmeId: programme.id, OR: [{ email }, { userId }] }, select: { id: true } });
  if (existing) return { ok: false, error: "You've already asked for a card in this programme." };

  let photoUrl: string | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (await isActionRateLimited("upload", userId)) return { ok: false, error: "Too many uploads. Please try again later." };
    try {
      const stored = await storeMemberIdImage(file, programme.organisationId, "member-id-photos");
      if ("error" in stored) return { ok: false, error: stored.error ?? "Could not upload the photo." };
      photoUrl = stored.url;
    } catch {
      console.error("[member-ids] join photo upload failed");
      return { ok: false, error: "Could not upload the photo. Try a different image." };
    }
  }

  try {
    const status = await prisma.$transaction(async (tx) => {
      const member = await tx.idMember.create({
        data: { programmeId: programme.id, organisationId: programme.organisationId, userId, name, email, photoUrl, fieldValues: checked.values, source: "FORM", verifyToken: newVerifyToken() },
        select: { id: true },
      });
      if (!programme.requiresApproval) {
        await approveMembers(tx, programme, [member.id]);
        return "APPROVED" as const;
      }
      return "PENDING" as const;
    });
    await recordAuditEvent({ action: "ID_MEMBER_REQUESTED", actorUserId: userId, organisationId: programme.organisationId, targetType: "IdProgramme", targetId: programme.id, metadata: { status } });
    revalidatePath(`/${organisationSlug}/ids/${programmeSlug}`);
    revalidatePath("/account/ids");
    return { ok: true, data: { status } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "You've already asked for a card in this programme." };
    throw error;
  }
}
