import type { BadgeEvent, BadgeDesignState } from "./data";
import type { BadgeBranding } from "./types";
import { managedImageUrl } from "./imageUrl";
import { normalizeIdCardPrintSettings } from "@/lib/idCardPrint";

export function badgeBrandingFor(event: BadgeEvent): BadgeBranding {
  const organisationId = event.organisationId;
  return {
    eventAccent: event.page?.accentColor ?? null,
    organisationLogoUrl: managedImageUrl(event.organisation.logoUrl, { kind: "organisation", organisationId, category: "organisation-logos" }),
    eventLogoUrl: managedImageUrl(event.page?.logoUrl, { kind: "organisation", organisationId, category: "event-page-logos" }),
    sponsorLogoUrls: event.sponsors.flatMap((sponsor) => managedImageUrl(sponsor.logoUrl, { kind: "organisation", organisationId, category: "event-sponsors" }) ?? []),
  };
}

export function badgeDesignFor(event: Pick<BadgeEvent, "title" | "organisation" | "badgeDesign">): BadgeDesignState {
  return {
    settings: normalizeIdCardPrintSettings(event.badgeDesign?.settings ?? null, event.title, event.organisation.name),
    saved: Boolean(event.badgeDesign),
    updatedAt: event.badgeDesign?.updatedAt.toISOString() ?? null,
  };
}
