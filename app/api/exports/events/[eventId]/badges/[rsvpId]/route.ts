import { recordAuditEvent } from "@/lib/audit";
import { badgeBrandingFor, badgeDesignFor, loadBadgeAttendee } from "@/lib/badge/data";
import { authorizeBadgeDownload, badgeRateLimited, download, jsonError, notFound, slugForFile } from "@/lib/badge/http";
import { renderBadge } from "@/lib/badge/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ eventId: string; rsvpId: string }> };

/** One attendee's badge as a PDF (card size) or a 300 dpi PNG. */
export async function GET(request: Request, context: RouteContext) {
  const { eventId, rsvpId } = await context.params;
  const access = await authorizeBadgeDownload(eventId);
  if (!access || rsvpId.length > 128) return notFound();

  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "png") return jsonError(400, "Choose PDF or PNG.");
  if (await badgeRateLimited(access.userId)) return jsonError(429, "Too many badge downloads. Please try again shortly.");

  // The RSVP must belong to this event, which belongs to the caller's organisation.
  const attendee = await loadBadgeAttendee(access.event.id, rsvpId);
  if (!attendee) return notFound();

  try {
    const { event } = access;
    const body = await renderBadge({
      settings: badgeDesignFor(event).settings,
      attendee,
      branding: badgeBrandingFor(event),
      format,
      title: `${event.title} badge`,
    });
    await recordAuditEvent({
      action: "BADGE_DOWNLOADED",
      actorUserId: access.userId,
      organisationId: event.organisationId,
      targetType: "RSVP",
      targetId: rsvpId,
      metadata: { format },
    });
    return download(body, format === "png" ? "image/png" : "application/pdf", `badge-${slugForFile(attendee.displayName, "attendee")}.${format}`);
  } catch {
    return jsonError(500, "The badge couldn't be prepared. Please try again.");
  }
}
