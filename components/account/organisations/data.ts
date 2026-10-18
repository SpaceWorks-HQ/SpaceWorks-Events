import "server-only";

import type { EventStatus, MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format/datetime";
import { permissionChipLabels } from "@/components/event-dashboard/settings/helpers";

const LISTED: EventStatus[] = ["PUBLISHED", "HIDDEN"];
const COLLABORATION_LIMIT = 50;
const INVITE_LIMIT = 20;

export type AccountMembershipRow = {
  id: string;
  organisation: { slug: string; name: string; logoUrl: string | null };
  role: MembershipRole;
  joinedLabel: string;
  upcoming: number;
  /** The only OWNER left; leaving would orphan the organisation. */
  soleOwner: boolean;
};

export type AccountCollaborationRow = {
  id: string;
  title: string;
  kind: "event" | "series";
  organisation: { name: string; logoUrl: string | null };
  permissions: string[];
  href: string;
};

export type AccountInviteRow = {
  id: string;
  title: string;
  organisationName: string;
  permissions: string[];
  expiresLabel: string;
};

export type AccountOrganisationsData = {
  memberships: AccountMembershipRow[];
  collaborations: AccountCollaborationRow[];
  /** `null` when the account email is unverified, so invites cannot be matched to it. */
  invites: AccountInviteRow[] | null;
};

/**
 * Everything the account Organisations page shows, scoped to one user. Selects
 * are explicit: invite tokens (hashes) and other members are never read.
 */
export async function loadAccountOrganisations(userId: string, now = new Date()): Promise<AccountOrganisationsData> {
  const [user, memberships, collaborations] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } }),
    prisma.membership.findMany({
      where: { userId },
      orderBy: { organisation: { name: "asc" } },
      select: { id: true, role: true, createdAt: true, organisation: { select: { id: true, slug: true, name: true, logoUrl: true } } },
    }),
    prisma.eventCollaborator.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: COLLABORATION_LIMIT,
      select: {
        id: true,
        permissions: true,
        event: { select: { id: true, title: true, organisation: { select: { slug: true, name: true, logoUrl: true } } } },
        series: { select: { id: true, title: true, organisation: { select: { slug: true, name: true, logoUrl: true } } } },
      },
    }),
  ]);

  const orgIds = memberships.map((membership) => membership.organisation.id);
  const ownedOrgIds = memberships.filter((membership) => membership.role === "OWNER").map((membership) => membership.organisation.id);
  const verifiedEmail = user?.email && user.emailVerified ? user.email.trim().toLowerCase() : null;

  const [upcomingByOrg, ownersByOrg, invites] = await Promise.all([
    orgIds.length
      ? prisma.event.groupBy({ by: ["organisationId"], where: { organisationId: { in: orgIds }, status: { in: LISTED }, endDateTime: { gte: now } }, _count: { _all: true } })
      : Promise.resolve([]),
    ownedOrgIds.length
      ? prisma.membership.groupBy({ by: ["organisationId"], where: { organisationId: { in: ownedOrgIds }, role: "OWNER" }, _count: { _all: true } })
      : Promise.resolve([]),
    verifiedEmail
      ? prisma.eventCollaboratorInvite.findMany({
          where: { email: verifiedEmail, usedAt: null, expiresAt: { gt: now } },
          orderBy: { expiresAt: "asc" },
          take: INVITE_LIMIT,
          select: {
            id: true,
            permissions: true,
            expiresAt: true,
            event: { select: { title: true, organisation: { select: { name: true } } } },
            series: { select: { title: true, organisation: { select: { name: true } } } },
          },
        })
      : Promise.resolve(null),
  ]);

  const upcoming = new Map(upcomingByOrg.map((group) => [group.organisationId, group._count._all]));
  const owners = new Map(ownersByOrg.map((group) => [group.organisationId, group._count._all]));

  return {
    memberships: memberships.map(({ id, role, createdAt, organisation }) => ({
      id,
      role,
      organisation: { slug: organisation.slug, name: organisation.name, logoUrl: organisation.logoUrl },
      joinedLabel: formatDate(createdAt, "UTC"),
      upcoming: upcoming.get(organisation.id) ?? 0,
      soleOwner: role === "OWNER" && (owners.get(organisation.id) ?? 0) <= 1,
    })),
    collaborations: collaborations.flatMap((row) => {
      const target = row.event ? { kind: "event" as const, ...row.event } : row.series ? { kind: "series" as const, ...row.series } : null;
      if (!target) return [];
      return [{
        id: row.id,
        title: target.title,
        kind: target.kind,
        organisation: { name: target.organisation.name, logoUrl: target.organisation.logoUrl },
        permissions: permissionChipLabels(row.permissions),
        // Any co-organiser grant opens the event dashboard (lib/eventAccess canViewEventDashboard).
        href: `/dashboard/${target.organisation.slug}/${target.kind}/${target.id}`,
      }];
    }),
    invites: invites
      ? invites.flatMap((invite) => {
          const target = invite.event ?? invite.series;
          if (!target) return [];
          return [{
            id: invite.id,
            title: target.title,
            organisationName: target.organisation.name,
            permissions: permissionChipLabels(invite.permissions),
            expiresLabel: `Expires ${formatDate(invite.expiresAt, "UTC")}`,
          }];
        })
      : null,
  };
}
