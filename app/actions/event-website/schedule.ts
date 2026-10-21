import "server-only";

import { EventPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugifyTitle, withSlugSuffix } from "@/lib/slug";
import { sanitizeRichText } from "@/lib/richText";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "../org";
import { context, fail, paths, revalidatePath, target, visibility } from "./access";

const scheduleTrackSchema = target
  .extend({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export async function saveScheduleTrack(input: unknown): Promise<ActionResult> {
  const parsed = scheduleTrackSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a track name.");
  const c = await context(parsed.data, EventPermission.PUBLISH_AND_SCHEDULE);
  if (!c) return fail("You do not have permission to manage programme tracks.");
  try {
    if (parsed.data.id) {
      const updated = await prisma.eventScheduleTrack.updateMany({
        where: { id: parsed.data.id, eventId: c.event.id },
        data: { name: parsed.data.name },
      });
      if (!updated.count) return fail("Track not found.");
    } else {
      const lastTrack = await prisma.eventScheduleTrack.findFirst({
        where: { eventId: c.event.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      await prisma.eventScheduleTrack.create({
        data: {
          eventId: c.event.id,
          name: parsed.data.name,
          sortOrder: (lastTrack?.sortOrder ?? -1) + 1,
        },
      });
    }
  } catch {
    return fail("A track with that name already exists.");
  }
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_SCHEDULE_TRACK_UPDATED" : "EVENT_SCHEDULE_TRACK_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventScheduleTrack",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

export async function deleteScheduleTrack(input: unknown): Promise<ActionResult> {
  const parsed = target.extend({ trackId: z.string().min(1) }).strict().safeParse(input);
  if (!parsed.success) return fail("Invalid programme track.");
  const c = await context(parsed.data, EventPermission.PUBLISH_AND_SCHEDULE);
  if (!c) return fail("You do not have permission to manage programme tracks.");
  const track = await prisma.eventScheduleTrack.findFirst({
    where: { id: parsed.data.trackId, eventId: c.event.id },
    select: { id: true, _count: { select: { sessions: true } } },
  });
  if (!track) return fail("Track not found.");
  if (track._count.sessions) return fail("Move or remove this track's sessions before deleting it.");
  await prisma.eventScheduleTrack.delete({ where: { id: track.id } });
  await recordAuditEvent({
    action: "EVENT_SCHEDULE_TRACK_DELETED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventScheduleTrack",
    targetId: track.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

export async function reorderScheduleTracks(input: unknown): Promise<ActionResult> {
  const parsed = target
    .extend({ trackIds: z.array(z.string().min(1)).min(1).max(60) })
    .strict()
    .safeParse(input);
  if (!parsed.success || new Set(parsed.data.trackIds).size !== parsed.data.trackIds.length)
    return fail("Invalid programme track order.");
  const c = await context(parsed.data, EventPermission.PUBLISH_AND_SCHEDULE);
  if (!c) return fail("You do not have permission to manage programme tracks.");
  const tracks = await prisma.eventScheduleTrack.findMany({
    where: { eventId: c.event.id, id: { in: parsed.data.trackIds } },
    select: { id: true },
  });
  if (tracks.length !== parsed.data.trackIds.length)
    return fail("One or more tracks do not belong to this event.");
  await prisma.$transaction(
    parsed.data.trackIds.map((id, sortOrder) =>
      prisma.eventScheduleTrack.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  await recordAuditEvent({
    action: "EVENT_SCHEDULE_TRACKS_REORDERED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "Event",
    targetId: c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true };
}

const sessionFail = (error: string): ActionResult<{ conflictingSessions: Array<{ id: string; title: string; }>; }> => ({ ok: false, error });

export async function saveSession(
  input: unknown,
): Promise<ActionResult<{ conflictingSessions: Array<{ id: string; title: string; }>; }>> {
  const parsed = target
    .extend({
      id: z.string().min(1).optional(),
      title: z.string().trim().min(1).max(200),
      descriptionHtml: z.string().max(50_000).default(""),
      startDateTime: z.coerce.date(),
      endDateTime: z.coerce.date(),
      type: z.string().trim().min(1).max(60),
      trackId: z.string().min(1),
      speakerIds: z.array(z.string().min(1)).max(50).default([]),
      visibility,
      sortOrder: z.number().int().min(0).max(10000).default(0),
    })
    .refine((v) => v.endDateTime > v.startDateTime, {
      message: "End must be after start.",
    })
    .safeParse(input);
  if (!parsed.success) return sessionFail("Invalid session.");
  const c = await context(parsed.data, EventPermission.PUBLISH_AND_SCHEDULE);
  if (!c) return sessionFail("You do not have permission to manage the program.");
  const track = await prisma.eventScheduleTrack.findFirst({
    where: { id: parsed.data.trackId, eventId: c.event.id },
    select: { id: true },
  });
  if (!track) return sessionFail("Choose a track belonging to this event.");
  const speakerCount = await prisma.eventSpeaker.count({
    where: { id: { in: parsed.data.speakerIds }, eventId: c.event.id },
  });
  if (speakerCount !== parsed.data.speakerIds.length)
    return sessionFail("One or more speakers do not belong to this event.");
  const base = slugifyTitle(parsed.data.title);
  let slug = base;
  let n = 0;
  while (
    await prisma.eventSession.findFirst({
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
    title: parsed.data.title,
    slug,
    descriptionHtml: sanitizeRichText(parsed.data.descriptionHtml),
    startDateTime: parsed.data.startDateTime,
    endDateTime: parsed.data.endDateTime,
    type: parsed.data.type,
    trackId: track.id,
    visibility: parsed.data.visibility,
    sortOrder: parsed.data.sortOrder,
  };
  if (
    parsed.data.id &&
    !(await prisma.eventSession.findFirst({
      where: { id: parsed.data.id, eventId: c.event.id },
      select: { id: true },
    }))
  )
    return sessionFail("Session not found.");
  const savedSession = await prisma.$transaction(async (tx) => {
    const session = parsed.data.id
      ? await tx.eventSession.update({ where: { id: parsed.data.id }, data })
      : await tx.eventSession.create({
        data: { eventId: c.event.id, ...data },
      });
    await tx.eventSessionSpeaker.deleteMany({
      where: { eventSessionId: session.id },
    });
    if (parsed.data.speakerIds.length)
      await tx.eventSessionSpeaker.createMany({
        data: parsed.data.speakerIds.map((speakerId, sortOrder) => ({
          eventSessionId: session.id,
          speakerId,
          sortOrder,
        })),
      });
    return session;
  });
  const conflicts = await prisma.eventSession.findMany({
    where: {
      eventId: c.event.id,
      trackId: track.id,
      id: { not: savedSession.id },
      startDateTime: { lt: parsed.data.endDateTime },
      endDateTime: { gt: parsed.data.startDateTime },
    },
    select: { id: true, title: true },
  });
  await recordAuditEvent({
    action: parsed.data.id ? "EVENT_SESSION_UPDATED" : "EVENT_SESSION_CREATED",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventSession",
    targetId: parsed.data.id ?? c.event.id,
  });
  paths(c.org.slug, c.event);
  return { ok: true, data: { conflictingSessions: conflicts } };
}

export async function setEventSessionDelay(
  input: unknown,
): Promise<ActionResult> {
  const parsed = target
    .extend({
      sessionId: z.string().min(1),
      delayMinutes: z.number().int().min(0).max(1440),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid programme delay.");
  const c = await context(parsed.data, EventPermission.PUBLISH_AND_SCHEDULE);
  if (!c) return fail("You do not have permission to manage the programme.");
  const result = await prisma.eventSession.updateMany({
    where: { id: parsed.data.sessionId, eventId: c.event.id },
    data: { delayMinutes: parsed.data.delayMinutes },
  });
  if (!result.count) return fail("Session not found.");
  const session = await prisma.eventSession.findFirst({
    where: { id: parsed.data.sessionId, eventId: c.event.id },
    select: { slug: true },
  });
  await recordAuditEvent({
    action: "EVENT_SESSION_DELAY_SET",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventSession",
    targetId: parsed.data.sessionId,
    metadata: { delayMinutes: parsed.data.delayMinutes },
  });
  paths(c.org.slug, c.event);
  if (session)
    revalidatePath(`/${c.org.slug}/${c.event.slug}/sessions/${session.slug}`);
  return { ok: true };
}
