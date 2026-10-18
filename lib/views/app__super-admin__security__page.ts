import { requireSuperAdminMfa } from "@/lib/permissions";
import { ApiClientStatus, MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DAY_MS, SECURITY_AUDIT_ACTIONS } from "@/lib/superAdminInsights";
import { auditRowSelect } from "@/components/super-admin/AuditTable";
const ACTION_WINDOW_DAYS = 7;

export async function loadSuperAdminSecurityView() {
  await requireSuperAdminMfa();
  const now = new Date();
  const actionSince = new Date(now.getTime() - ACTION_WINDOW_DAYS * DAY_MS);
  const managerWhere = { memberships: { some: { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } } } };
  const [
    users,
    mfaUsers,
    unverifiedUsers,
    passwordUsers,
    managers,
    managersWithoutMfa,
    providerGroups,
    activeSessions,
    actionCounts,
    recentSecurityEvents,
    apiClients,
    activeClients,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { mfaEnabledAt: { not: null } } }),
    prisma.user.count({ where: { emailVerified: null } }),
    prisma.user.count({ where: { passwordHash: { not: null } } }),
    prisma.user.count({ where: managerWhere }),
    prisma.user.count({ where: { ...managerWhere, mfaEnabledAt: null } }),
    prisma.account.groupBy({ by: ["provider"], _count: { _all: true } }),
    prisma.session.count({ where: { expires: { gt: now } } }),
    prisma.auditEvent.groupBy({
      by: ["action"],
      where: { action: { in: [...SECURITY_AUDIT_ACTIONS] }, createdAt: { gte: actionSince } },
      _count: { _all: true },
    }),
    prisma.auditEvent.findMany({
      where: { action: { in: [...SECURITY_AUDIT_ACTIONS] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: auditRowSelect,
    }),
    prisma.apiClient.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        organisation: { select: { id: true, name: true, slug: true } },
        scopes: { select: { scope: true }, orderBy: { scope: "asc" } },
        // Lifecycle timestamps only; the credential digest is never loaded.
        credentials: { select: { revokedAt: true, expiresAt: true, lastUsedAt: true }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    }),
    prisma.apiClient.count({ where: { status: ApiClientStatus.ACTIVE } }),
  ]);
  const sortedActions = [...actionCounts].sort((a, b) => b._count._all - a._count._all);
  return { mfaUsers, users, managersWithoutMfa, managers, unverifiedUsers, activeClients, passwordUsers, providerGroups, activeSessions, sortedActions, recentSecurityEvents, apiClients, now };
}
