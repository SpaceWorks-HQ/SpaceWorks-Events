import { EventPrivacyType, EventStatus, type Prisma } from "@prisma/client";

export function isEventPublished(status: EventStatus): boolean {
  return status === EventStatus.PUBLISHED;
}

/**
 * Whether a standalone event's audience allows public listing: fully public,
 * or approval-required with `listedPublicly` (people find it, then ask to join).
 */
export function isListedAudience(privacyType: EventPrivacyType, listedPublicly = false): boolean {
  return privacyType === EventPrivacyType.PUBLIC || (privacyType === EventPrivacyType.APPROVAL_REQUIRED && listedPublicly);
}

/** The same rule as a Prisma filter; combine with `AND` so it never clashes with a search `OR`. */
export const listedEventAudienceWhere = {
  OR: [
    { privacyType: EventPrivacyType.PUBLIC },
    { privacyType: EventPrivacyType.APPROVAL_REQUIRED, listedPublicly: true },
  ],
} satisfies Prisma.EventWhereInput;

/** Listed on /discover and org public page (standalone events). */
export function isDiscoverableEvent(
  status: EventStatus,
  privacyType: EventPrivacyType,
  listedPublicly = false,
): boolean {
  return status === EventStatus.PUBLISHED && isListedAudience(privacyType, listedPublicly);
}

/** Search engines: index only published content that is listed publicly. */
export function shouldIndexPublicEvent(
  status: EventStatus,
  privacyType: EventPrivacyType,
  listedPublicly = false,
): boolean {
  return isDiscoverableEvent(status, privacyType, listedPublicly);
}

export function isDiscoverableSeries(
  status: EventStatus,
  privacyType: EventPrivacyType,
): boolean {
  return isDiscoverableEvent(status, privacyType);
}
