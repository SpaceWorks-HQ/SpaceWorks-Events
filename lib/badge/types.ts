import type { IdCardPrintSettings } from "@/lib/idCardPrint";

/** Everything printed about one attendee. */
export type IdCardAttendee = {
  rsvpId?: string;
  displayName: string;
  email: string | null;
  /** Active ticket bearer token used only for rendering this attendee's QR. Never log or persist it. */
  checkInQrToken: string;
  checkInDetails: Array<{ label: string; value: string }>;
  registrationDetails: Array<{ key: string; label: string; value: string }>;
  /** Managed (uploaded) profile image only; see lib/badge/imageUrl.ts. */
  photoUrl?: string | null;
};

/**
 * Event and organisation artwork for badges. Every URL is an
 * application-managed upload URL that passed `managedImageUrl`.
 */
export type BadgeBranding = {
  eventAccent: string | null;
  organisationLogoUrl: string | null;
  eventLogoUrl: string | null;
  sponsorLogoUrls: string[];
};

export const EMPTY_BRANDING: BadgeBranding = { eventAccent: null, organisationLogoUrl: null, eventLogoUrl: null, sponsorLogoUrls: [] };

export type PrintableField = { key: string; label: string; value: string };

/** The registration answers chosen for the card, in the chosen order, that this attendee actually has. */
export function printableFields(settings: IdCardPrintSettings, attendee: Pick<IdCardAttendee, "registrationDetails">): PrintableField[] {
  const details = new Map(attendee.registrationDetails.map((detail) => [detail.key, detail]));
  return settings.printFieldKeys.flatMap((key) => {
    const detail = details.get(key.startsWith("registration:") ? key.slice("registration:".length) : key);
    return detail ? [{ key, label: detail.label, value: detail.value }] : [];
  });
}

/** Up to two initials for the photo placeholder. */
export function attendeeInitials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]!][0] ?? "";
  const last = words.length > 1 ? [...words[words.length - 1]!][0] ?? "" : "";
  return (first + last).toLocaleUpperCase("en");
}
