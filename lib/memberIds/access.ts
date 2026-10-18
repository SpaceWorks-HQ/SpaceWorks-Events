import "server-only";

import type { MembershipRole, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMembership, hasRoleAtLeast, isOrgAdmin } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { memberCardSelect, programmeSelect } from "./data";

/*
 * Download access. Organiser downloads need OWNER/ADMIN of the programme's
 * own organisation (cards carry personal details). Wallet downloads are the
 * signed-in person's own cards: linked to their account, or issued to their
 * verified email address. Anything else is "not found".
 */

export type MemberIdsAccess = {
  userId: string;
  organisation: { id: string; slug: string; name: string; logoUrl: string | null };
  role: MembershipRole;
  canManage: boolean;
};

/** The caller's role in the organisation named by the slug, or null (treat as not found). */
export async function memberIdsAccess(userId: string, organisationSlug: string, minRole: MembershipRole = "MEMBER"): Promise<MemberIdsAccess | null> {
  if (!organisationSlug || organisationSlug.length > 120) return null;
  const organisation = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true, name: true, logoUrl: true } });
  if (!organisation) return null;
  const membership = await getMembership(userId, organisation.id);
  if (!membership || !hasRoleAtLeast(membership.role, minRole)) return null;
  return { userId, organisation, role: membership.role, canManage: hasRoleAtLeast(membership.role, "ADMIN") };
}

export async function authorizeProgrammeDownload(programmeId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !programmeId || programmeId.length > 128) return null;
  const programme = await prisma.idProgramme.findUnique({
    where: { id: programmeId },
    select: { ...programmeSelect, organisation: { select: { name: true, slug: true, logoUrl: true } } },
  });
  if (!programme) return null;
  const membership = await getMembership(userId, programme.organisationId);
  if (!membership || !isOrgAdmin(membership.role)) return null;
  return { userId, programme };
}

export function downloadRateLimited(userId: string) {
  return checkRateLimitById("checkin", `member-ids:${userId}`).then((allowed) => !allowed);
}

/** Which members are "mine": linked to my account, or unclaimed and issued to my verified email. */
export async function walletWhere(userId: string): Promise<Prisma.IdMemberWhereInput> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  const email = user?.emailVerified && user.email ? user.email.trim().toLowerCase() : null;
  return email ? { OR: [{ userId }, { userId: null, email }] } : { userId };
}

export const walletSelect = {
  ...memberCardSelect,
  status: true,
  createdAt: true,
  programme: {
    select: {
      id: true,
      name: true,
      slug: true,
      organisationId: true,
      design: true,
      watermarkUrl: true,
      fields: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { key: true, label: true, type: true, placement: true } },
      organisation: { select: { name: true, slug: true, logoUrl: true } },
    },
  },
} satisfies Prisma.IdMemberSelect;

export async function loadWalletMember(userId: string, memberId: string) {
  if (!memberId || memberId.length > 128) return null;
  return prisma.idMember.findFirst({ where: { AND: [{ id: memberId }, await walletWhere(userId)] }, select: walletSelect });
}
