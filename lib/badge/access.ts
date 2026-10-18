import "server-only";

import { EventPermission } from "@prisma/client";
import { canAccessEvent } from "@/lib/eventAccess";

/**
 * Badges carry bearer QR tokens, so access is exactly the check-in desk's:
 * an OWNER/ADMIN of the event's own organisation, or a collaborator with the
 * CHECK_IN permission on this event. The organisation comes from the event
 * record, never from the request.
 */
export function canUseBadges(userId: string, event: { id: string; organisationId: string }) {
  return canAccessEvent({ userId, organisationId: event.organisationId, eventId: event.id, permission: EventPermission.CHECK_IN });
}
