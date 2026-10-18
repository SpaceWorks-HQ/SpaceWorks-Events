import { notFound } from "next/navigation";
import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditRowSelect } from "@/components/super-admin/AuditTable";
type Props = {
  params: Promise<{ orgId: string; }>;
};
export async function loadSuperAdminOrgDetailView({ params }: Props) {

  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const { orgId } = await params;

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      createdAt: true,
      _count: { select: { events: true, eventSeries: true, memberships: true } },
    },
  });

  if (!org) notFound();

  const now = new Date();
  const orgRsvpWhere = { OR: [{ event: { organisationId: org.id } }, { eventInstance: { series: { organisationId: org.id } } }] };
  const [rsvpCount, checkedInCount, broadcastStats, feedbackCount, assetStats, apiClients, auditEvents] = await Promise.all([
    prisma.rSVP.count({ where: orgRsvpWhere }),
    prisma.rSVP.count({ where: { ...orgRsvpWhere, checkedInAt: { not: null } } }),
    prisma.eventBroadcast.aggregate({ where: { event: { organisationId: org.id } }, _count: { _all: true }, _sum: { recipientCount: true } }),
    prisma.eventFeedbackResponse.count({ where: { form: { event: { organisationId: org.id } } } }),
    prisma.asset.aggregate({ where: { organisationId: org.id }, _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.apiClient.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        scopes: { select: { scope: true }, orderBy: { scope: "asc" } },
        // Lifecycle timestamps only; the credential digest is never loaded.
        credentials: { select: { revokedAt: true, expiresAt: true, lastUsedAt: true }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    }),
    prisma.auditEvent.findMany({ where: { organisationId: org.id }, orderBy: { createdAt: "desc" }, take: 25, select: auditRowSelect }),
  ]);

  const [members, events, series, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.event.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        privacyType: true,
        startDateTime: true,
        createdAt: true,
        _count: { select: { rsvps: true } },
      },
    }),
    prisma.eventSeries.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        privacyType: true,
        createdAt: true,
        _count: { select: { instances: true, invites: true } },
      },
    }),
    prisma.organisationInvite.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        createdBy: { select: { email: true } },
        usedBy: { select: { email: true } },
      },
    }),
  ]);


  return { org, rsvpCount, checkedInCount, broadcastStats, feedbackCount, assetStats, apiClients, auditEvents, members, events, series, invites, now };
}
