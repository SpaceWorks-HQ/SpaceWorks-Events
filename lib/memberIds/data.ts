import "server-only";

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { managedImageUrl } from "@/lib/badge/imageUrl";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import { prisma } from "@/lib/db";
import { formatCardDate, memberDetails, type FieldPlacement, type FieldType } from "./core";
import { normalizeMemberIdDesign, type MemberIdDesign } from "./design";

/*
 * Database side of member IDs. Every organiser read resolves the
 * organisation from the URL slug, checks membership and role, and then
 * scopes each query by that organisation's id, so a programme or member id
 * from another organisation is simply "not found".
 */

/** 128 random bits, URL-safe. Never sequential, never derived from the member. */
export function newVerifyToken() {
  return crypto.randomBytes(16).toString("base64url");
}

export const VERIFY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function verifyUrl(token: string, origin: string) {
  return `${origin.replace(/\/$/, "")}/verify/${token}`;
}

export function publicOrigin(request?: Request) {
  const canonical = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (canonical) return canonical;
  return request ? new URL(request.url).origin : "http://localhost:3000";
}

export const programmeSelect = {
  id: true,
  organisationId: true,
  name: true,
  slug: true,
  description: true,
  status: true,
  registrationOpen: true,
  requiresApproval: true,
  idPrefix: true,
  validUntil: true,
  validityDays: true,
  design: true,
  watermarkUrl: true,
  createdAt: true,
  updatedAt: true,
  fields: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, key: true, label: true, type: true, required: true, options: true, placement: true, sortOrder: true } },
} satisfies Prisma.IdProgrammeSelect;

export type ProgrammeRecord = Prisma.IdProgrammeGetPayload<{ select: typeof programmeSelect }>;

/** A programme of this organisation only. */
export function loadProgramme(organisationId: string, programmeId: string) {
  if (!programmeId || programmeId.length > 128) return Promise.resolve(null);
  return prisma.idProgramme.findFirst({ where: { id: programmeId, organisationId }, select: programmeSelect });
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

export type FieldRecord = { key: string; label: string; type: FieldType; placement: FieldPlacement };

export const memberCardSelect = {
  id: true,
  programmeId: true,
  organisationId: true,
  name: true,
  email: true,
  photoUrl: true,
  fieldValues: true,
  status: true,
  idNumber: true,
  verifyToken: true,
  issuedAt: true,
  expiresAt: true,
} satisfies Prisma.IdMemberSelect;

export type MemberCardRecord = Prisma.IdMemberGetPayload<{ select: typeof memberCardSelect }>;

/** The photo only when it is this organisation's own member-ID upload. */
export function memberPhotoUrl(member: Pick<MemberCardRecord, "photoUrl" | "organisationId">) {
  return managedImageUrl(member.photoUrl, { kind: "organisation", organisationId: member.organisationId, category: "member-id-photos" });
}

/** Everything a card prints about one member. The QR carries the public verify link. */
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
