import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function loadSuperAdminInvitesView() {
  await requireSuperAdminMfa();
  const [orgInvites, eventInvites, seriesInvites] = await Promise.all([
    prisma.organisationInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        organisation: { select: { id: true, slug: true, name: true } },
        createdBy: { select: { email: true } },
        usedBy: { select: { email: true } },
      },
    }),
    prisma.eventInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        createdAt: true,
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            organisation: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    }),
    prisma.seriesInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        createdAt: true,
        series: {
          select: {
            id: true,
            slug: true,
            title: true,
            organisation: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    }),
  ]);
  return { orgInvites, eventInvites, seriesInvites };
}
