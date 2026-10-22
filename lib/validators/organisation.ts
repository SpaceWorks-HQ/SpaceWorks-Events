import { z } from "zod";
import { orgScoped } from "@/lib/validators/shared";

export const updateMemberRoleSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  targetUserId: z.string().trim().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const removeMemberSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  targetUserId: z.string().trim().min(1),
});

export const createOrgInviteSchema = z.object({
  organisationSlug: z.string().trim().min(1),
});

export const revokeOrgInviteSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  inviteId: z.string().trim().min(1),
});

export const deleteOrganisationSchema = z.object({
  organisationSlug: z.string().trim().min(1),
});

export const addEventInviteSchema = orgScoped.extend({
  eventId: z.string().trim().min(1),
  email: z.string().trim().email("Valid email required"),
});

export const removeEventInviteSchema = orgScoped.extend({
  inviteId: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
});

export const addSeriesInviteSchema = orgScoped.extend({
  eventSeriesId: z.string().trim().min(1),
  email: z.string().trim().email("Valid email required"),
});

export const removeSeriesInviteSchema = orgScoped.extend({
  inviteId: z.string().trim().min(1),
  eventSeriesId: z.string().trim().min(1),
});
