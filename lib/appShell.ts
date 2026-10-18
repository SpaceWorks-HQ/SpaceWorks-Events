import "server-only";

import type { MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPendingApprovalsByOrg } from "@/lib/dashboardHome";
import { isOrgAdmin } from "@/lib/permissions";

export type ShellOrganisation = {
  slug: string;
  name: string;
  logoUrl: string | null;
  role: MembershipRole | "COLLABORATOR";
  /** Registrations waiting for approval; only counted where the person manages the organisation. */
  pendingApprovals: number;
};

export type ShellUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

const MAX_SHELL_ORGANISATIONS = 50;

/**
 * Data for the dashboard sidebar: the signed-in person and the organisations
 * they can open. Membership organisations first, then organisations reached
 * only through an event or series collaborator grant (those only expose
 * events, matching requireOrgDashboardAccess).
 */
export async function getAppShellData(userId: string): Promise<{ user: ShellUser; organisations: ShellOrganisation[] }> {
  const [user, memberships, grants] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true, profileImageUrl: true } }),
    prisma.membership.findMany({
      where: { userId },
      select: { role: true, organisation: { select: { id: true, slug: true, name: true, logoUrl: true } } },
      orderBy: { organisation: { name: "asc" } },
      take: MAX_SHELL_ORGANISATIONS,
    }),
    prisma.eventCollaborator.findMany({
      where: { userId },
      select: {
        event: { select: { organisation: { select: { slug: true, name: true, logoUrl: true } } } },
        series: { select: { organisation: { select: { slug: true, name: true, logoUrl: true } } } },
      },
      take: MAX_SHELL_ORGANISATIONS,
    }),
  ]);

  const pending = await getPendingApprovalsByOrg(memberships.filter((membership) => isOrgAdmin(membership.role)).map((membership) => membership.organisation.id));
  const organisations: ShellOrganisation[] = memberships.map(({ role, organisation: { id, ...organisation } }) => ({ ...organisation, role, pendingApprovals: pending.get(id) ?? 0 }));
  const seen = new Set(organisations.map((organisation) => organisation.slug));
  for (const grant of grants) {
    const organisation = grant.event?.organisation ?? grant.series?.organisation;
    if (!organisation || seen.has(organisation.slug)) continue;
    seen.add(organisation.slug);
    organisations.push({ ...organisation, role: "COLLABORATOR", pendingApprovals: 0 });
  }

  return {
    user: { name: user?.name ?? null, email: user?.email ?? null, image: user?.profileImageUrl ?? user?.image ?? null },
    organisations,
  };
}
