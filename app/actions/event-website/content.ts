import "server-only";

import { EventPermission, SponsorTier } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugifyTitle, withSlugSuffix } from "@/lib/slug";
import { sanitizeRichText } from "@/lib/richText";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "../org";
import { isOrganisationUploadUrl } from "@/lib/uploadUrl";
import { context, fail, http, optionalImageUrl, optionalUrl, paths, target, visibility } from "./access";

const simpleContent = target.extend({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  visibility,
  sortOrder: z.number().int().min(0).max(10000).default(0),
});
export async function saveHighlight(input: unknown): Promise<ActionResult> {
  const parsed = simpleContent
    .extend({ icon: z.string().trim().max(40).optional().default("") })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid highlight.");
  const c = await context(parsed.data, EventPermission.EDIT_DETAILS);
  if (!c) return fail("You do not have permission to manage highlights.");
  const data = {
    title: parsed.data.title,
    description: parsed.data.description,
    icon: parsed.data.icon || null,
    visibility: parsed.data.visibility,
    sortOrder: parsed.data.sortOrder,
  };
  if (parsed.data.id)
    await prisma.eventHighlight.updateMany({
      where: { id: parsed.data.id, eventId: c.event.id },
      data,
    });
  else
    await prisma.eventHighlight.create({
      data: { eventId: c.event.id, ...data },
    });
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_HIGHLIGHT_UPDATED" : "EVENT_HIGHLIGHT_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventHighlight",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

export async function saveSpeaker(input: unknown): Promise<ActionResult> {
  const parsed = simpleContent
    .extend({
      headline: z.string().trim().max(200).default(""),
      organisation: z.string().trim().max(200).default(""),
      photoUrl: optionalImageUrl,
      websiteUrl: optionalUrl,
      linkedinUrl: optionalUrl,
      xUrl: optionalUrl,
      bioHtml: z.string().max(50_000).default(""),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid speaker.");
  const c = await context(parsed.data, EventPermission.EDIT_DETAILS);
  if (!c) return fail("You do not have permission to manage speakers.");
  if (
    parsed.data.photoUrl &&
    !isOrganisationUploadUrl(parsed.data.photoUrl, c.org.id, "event-speakers")
  )
    return fail("Choose an uploaded speaker photo.");
  const base = slugifyTitle(parsed.data.title);
  let slug = base;
  let n = 0;
  while (
    await prisma.eventSpeaker.findFirst({
      where: {
        eventId: c.event.id,
        slug,
        ...(parsed.data.id ? { id: { not: parsed.data.id } } : {}),
      },
      select: { id: true },
    })
  )
    slug = withSlugSuffix(base, ++n);
  const data = {
    name: parsed.data.title,
    slug,
    headline: parsed.data.headline,
    organisation: parsed.data.organisation,
    photoUrl: parsed.data.photoUrl || null,
    websiteUrl: parsed.data.websiteUrl || null,
    linkedinUrl: parsed.data.linkedinUrl || null,
    xUrl: parsed.data.xUrl || null,
    bioHtml: sanitizeRichText(parsed.data.bioHtml),
    visibility: parsed.data.visibility,
    sortOrder: parsed.data.sortOrder,
  };
  if (parsed.data.id)
    await prisma.eventSpeaker.updateMany({
      where: { id: parsed.data.id, eventId: c.event.id },
      data,
    });
  else
    await prisma.eventSpeaker.create({
      data: { eventId: c.event.id, ...data },
    });
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_SPEAKER_UPDATED" : "EVENT_SPEAKER_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventSpeaker",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

export async function saveSponsor(input: unknown): Promise<ActionResult> {
  const parsed = simpleContent
    .extend({
      logoUrl: optionalImageUrl,
      websiteUrl: optionalUrl,
      tier: z.nativeEnum(SponsorTier).default(SponsorTier.PARTNER),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid sponsor.");
  const c = await context(parsed.data, EventPermission.EDIT_DETAILS);
  if (!c) return fail("You do not have permission to manage sponsors.");
  if (
    parsed.data.logoUrl &&
    !isOrganisationUploadUrl(parsed.data.logoUrl, c.org.id, "event-sponsors")
  )
    return fail("Choose an uploaded sponsor logo.");
  const data = {
    name: parsed.data.title,
    description: parsed.data.description,
    logoUrl: parsed.data.logoUrl || null,
    websiteUrl: parsed.data.websiteUrl || null,
    tier: parsed.data.tier,
    visibility: parsed.data.visibility,
    sortOrder: parsed.data.sortOrder,
  };
  if (parsed.data.id)
    await prisma.eventSponsor.updateMany({
      where: { id: parsed.data.id, eventId: c.event.id },
      data,
    });
  else
    await prisma.eventSponsor.create({
      data: { eventId: c.event.id, ...data },
    });
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_SPONSOR_UPDATED" : "EVENT_SPONSOR_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventSponsor",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

export async function saveResource(input: unknown): Promise<ActionResult> {
  const parsed = simpleContent.extend({ externalUrl: http }).safeParse(input);
  if (!parsed.success) return fail("Invalid resource.");
  const c = await context(parsed.data, EventPermission.EDIT_DETAILS);
  if (!c) return fail("You do not have permission to manage resources.");
  const data = {
    title: parsed.data.title,
    description: parsed.data.description,
    externalUrl: parsed.data.externalUrl,
    assetKey: null,
    visibility: parsed.data.visibility,
    sortOrder: parsed.data.sortOrder,
  };
  if (parsed.data.id)
    await prisma.eventResource.updateMany({
      where: { id: parsed.data.id, eventId: c.event.id },
      data,
    });
  else
    await prisma.eventResource.create({
      data: { eventId: c.event.id, ...data },
    });
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_RESOURCE_UPDATED" : "EVENT_RESOURCE_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventResource",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

export async function saveFaq(input: unknown): Promise<ActionResult> {
  const parsed = target
    .extend({
      id: z.string().min(1).optional(),
      question: z.string().trim().min(1).max(400),
      answerHtml: z.string().max(50_000),
      visibility,
      sortOrder: z.number().int().min(0).max(10000).default(0),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid FAQ.");
  const c = await context(parsed.data, EventPermission.EDIT_DETAILS);
  if (!c) return fail("You do not have permission to manage FAQs.");
  const data = {
    question: parsed.data.question,
    answerHtml: sanitizeRichText(parsed.data.answerHtml),
    visibility: parsed.data.visibility,
    sortOrder: parsed.data.sortOrder,
  };
  if (parsed.data.id)
    await prisma.eventFaq.updateMany({
      where: { id: parsed.data.id, eventId: c.event.id },
      data,
    });
  else await prisma.eventFaq.create({ data: { eventId: c.event.id, ...data } });
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_FAQ_UPDATED" : "EVENT_FAQ_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventFaq",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}
