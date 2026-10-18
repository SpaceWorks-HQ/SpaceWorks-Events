import "server-only";

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";


import { prisma } from "@/lib/db";
import { type FieldPlacement, type FieldType } from "./core";


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

export type ProgrammeRecord = Prisma.IdProgrammeGetPayload<{ select: typeof programmeSelect; }>;

/** A programme of this organisation only. */
export function loadProgramme(organisationId: string, programmeId: string) {
  if (!programmeId || programmeId.length > 128) return Promise.resolve(null);
  return prisma.idProgramme.findFirst({ where: { id: programmeId, organisationId }, select: programmeSelect });
}

export type FieldRecord = { key: string; label: string; type: FieldType; placement: FieldPlacement; };

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

export type MemberCardRecord = Prisma.IdMemberGetPayload<{ select: typeof memberCardSelect; }>;

export { verifyUrl, publicOrigin, programmeDesign, programmeBranding, memberPhotoUrl, memberCardPerson } from "@/lib/memberIds/presentation";
