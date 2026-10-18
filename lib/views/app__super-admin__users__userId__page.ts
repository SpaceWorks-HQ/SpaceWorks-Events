import { notFound } from "next/navigation";
import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditRowSelect } from "@/components/super-admin/AuditTable";
type Props = {
  params: Promise<{ userId: string; }>;
};
export async function loadSuperAdminUserDetailView({ params }: Props) {

  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const { userId } = await params;
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    // Flags and counts only: no password hash, MFA seed, or recovery codes.
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      mfaEnabledAt: true,
      createdAt: true,
      profileImageUrl: true,
      image: true,
      _count: { select: { memberships: true, rsvps: true, eventCollaborations: true, sessions: true } },
    },
  });

  if (!user) notFound();

  const [hasPassword, accounts, activeSessions, memberships, rsvpStatuses, checkedIn, rsvps, auditEvents] = await Promise.all([
    prisma.user.count({ where: { id: user.id, passwordHash: { not: null } } }),
    prisma.account.findMany({ where: { userId: user.id }, select: { id: true, provider: true, type: true } }),
    prisma.session.count({ where: { userId: user.id, expires: { gt: now } } }),
    prisma.membership.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, role: true, createdAt: true, organisation: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.rSVP.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
    prisma.rSVP.count({ where: { userId: user.id, checkedInAt: { not: null } } }),
    prisma.rSVP.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      // The check-in token and registration answers are deliberately not selected.
      select: {
        id: true,
        status: true,
        checkedInAt: true,
        createdAt: true,
        event: { select: { title: true, organisation: { select: { id: true, name: true } } } },
        eventInstance: { select: { startDateTime: true, series: { select: { title: true, organisation: { select: { id: true, name: true } } } } } },
      },
    }),
    prisma.auditEvent.findMany({ where: { actorUserId: user.id }, orderBy: { createdAt: "desc" }, take: 20, select: auditRowSelect }),
  ]);

  const displayName = user.name ?? user.email ?? "Unnamed user";


  return { user, hasPassword, accounts, activeSessions, memberships, rsvpStatuses, checkedIn, rsvps, auditEvents, displayName, now };
}
