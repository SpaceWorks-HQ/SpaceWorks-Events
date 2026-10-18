import { recordAuditEvent } from "@/lib/audit";
import { badgeAttendees, badgeBrandingFor, badgeDesignFor, countBadgeAttendees } from "@/lib/badge/data";
import { isBadgeStatusFilter } from "@/lib/badge/filters";
import { authorizeBadgeDownload, badgeRateLimited, download, jsonError, notFound, slugForFile } from "@/lib/badge/http";
import { renderBadgeBatch } from "@/lib/badge/render";
import { tryAcquireRenderSlot } from "@/lib/badge/renderSlot";
import { BULK_BADGE_LIMIT } from "@/lib/badge/sheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ eventId: string }> };

/** All matching attendees' badges as one print-ready PDF (card pages or A4 sheets with crop marks). */
export async function GET(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const access = await authorizeBadgeDownload(eventId);
  if (!access) return notFound();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const status = url.searchParams.get("status") ?? "confirmed";
  const layout = url.searchParams.get("layout") === "a4" ? "a4" : "card";
  if (format !== "pdf" || !isBadgeStatusFilter(status)) return jsonError(400, "Choose a PDF and one of the attendee filters.");
  if (await badgeRateLimited(access.userId)) return jsonError(429, "Too many badge downloads. Please try again shortly.");

  const count = await countBadgeAttendees(access.event.id, status);
  if (count === 0) return jsonError(422, "No attendees match this filter yet.");
  if (count > BULK_BADGE_LIMIT) {
    return jsonError(413, `This filter matches ${count} attendees. One download holds up to ${BULK_BADGE_LIMIT}; choose a narrower filter.`);
  }
  const release = tryAcquireRenderSlot();
  if (!release) return jsonError(429, "Another badge download is being prepared. Try again in a minute.");

  try {
    const { event } = access;
    const pdf = await renderBadgeBatch({
      settings: badgeDesignFor(event).settings,
      attendees: badgeAttendees(event.id, status, BULK_BADGE_LIMIT),
      branding: badgeBrandingFor(event),
      layout,
      title: `${event.title} badges`,
    });
    await recordAuditEvent({
      action: "BADGES_EXPORTED",
      actorUserId: access.userId,
      organisationId: event.organisationId,
      targetType: "Event",
      targetId: event.id,
      metadata: { count, status, layout },
    });
    return download(pdf, "application/pdf", `badges-${slugForFile(event.slug, "event")}${layout === "a4" ? "-a4" : ""}.pdf`);
  } catch {
    return jsonError(500, "The badges couldn't be prepared. Please try again.");
  } finally {
    release();
  }
}
