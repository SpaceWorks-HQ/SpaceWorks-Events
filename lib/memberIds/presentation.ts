import type { ProgrammeRecord, MemberCardRecord, FieldRecord } from "./data";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import { managedImageUrl } from "@/lib/badge/imageUrl";
import { formatCardDate, memberDetails } from "./core";
import { normalizeMemberIdDesign, type MemberIdDesign } from "./design";

export function verifyUrl(token: string, origin: string) {
  return `${origin.replace(/\/$/, "")}/verify/${token}`;
}

export function publicOrigin(request?: Request) {
  const canonical = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (canonical) return canonical;
  return request ? new URL(request.url).origin : "http://localhost:3000";
}

export function programmeDesign(programme: Pick<ProgrammeRecord, "design" | "name">, organisationName: string): MemberIdDesign {
  return normalizeMemberIdDesign(programme.design, { programmeName: programme.name, organisationName });
}

export function programmeBranding(programme: Pick<ProgrammeRecord, "organisationId" | "watermarkUrl">, organisationLogoUrl: string | null): BadgeBranding {
  const organisationId = programme.organisationId;
  return {
    eventAccent: null,
    organisationLogoUrl: managedImageUrl(organisationLogoUrl, { kind: "organisation", organisationId, category: "organisation-logos" }),
    eventLogoUrl: null,
    sponsorLogoUrls: [],
    watermarkUrl: managedImageUrl(programme.watermarkUrl, { kind: "organisation", organisationId, category: "member-id-watermarks" }),
  };
}

export function memberPhotoUrl(member: Pick<MemberCardRecord, "photoUrl" | "organisationId">) {
  return managedImageUrl(member.photoUrl, { kind: "organisation", organisationId: member.organisationId, category: "member-id-photos" });
}

export function memberCardPerson(member: MemberCardRecord, fields: FieldRecord[], origin: string): IdCardAttendee {
  return {
    displayName: member.name,
    email: member.email,
    checkInQrToken: verifyUrl(member.verifyToken, origin),
    checkInDetails: [],
    registrationDetails: memberDetails(fields, member.fieldValues),
    photoUrl: memberPhotoUrl(member),
    idNumber: member.idNumber,
    validUntil: member.expiresAt ? formatCardDate(member.expiresAt) : "No expiry",
  };
}
