import type { Event } from "@prisma/client";

// Explicit Event fields and relations used by page renderers. Station secrets
// stay on the backend even when an organiser can operate that station.
const eventFields = new Set([
  "id", "organisationId", "title", "slug", "description", "tags", "showRegistrationCount", "coverImageUrl",
  "startDateTime", "endDateTime", "timezone", "location", "mapLinkUrl", "isOnline", "capacity", "status", "privacyType",
  "listedPublicly", "registrationClosesAt", "registrationLeadMinutes", "shortCode", "createdAt",
  "page", "highlights", "speakers", "sponsors", "resources", "faqs", "sessions", "organisation", "feedbackForm", "registrationForm", "badgeDesign", "_count",
]);
type SecretField = "checkInStationPinHash" | "checkInStationPinEncrypted" | "checkInStationSecretVersion";

export function eventForView<T extends Partial<Event>>(event: T): Omit<T, SecretField> {
  return Object.fromEntries(Object.entries(event).filter(([key]) => eventFields.has(key))) as Omit<T, SecretField>;
}
