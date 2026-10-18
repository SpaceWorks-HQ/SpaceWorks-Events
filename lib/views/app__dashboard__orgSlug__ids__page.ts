import { prisma } from "@/lib/db";
import { isOrgAdmin, requireOrgMembership } from "@/lib/permissions";
type Props = { params: Promise<{ orgSlug: string; }>; };

export async function loadMemberIdsView({ params }: Props) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgMembership(orgSlug);
  const canManage = isOrgAdmin(membership.role);
  const [profile, programmes] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { logoUrl: true } }),
    prisma.idProgramme.findMany({
      where: { organisationId: organisation.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, status: true, registrationOpen: true, _count: { select: { members: true } } },
    }),
  ]);
  const pendingCounts = programmes.length
    ? await prisma.idMember.groupBy({ by: ["programmeId"], where: { organisationId: organisation.id, status: "PENDING" }, _count: { _all: true } })
    : [];
  const pending = new Map(pendingCounts.map((row) => [row.programmeId, row._count._all]));
  return { organisation, profile, programmes, canManage, pending };
}
