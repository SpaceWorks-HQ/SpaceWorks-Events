import { requireSuperAdminMfa } from "@/lib/permissions";
import { ApiClientStatus, MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { credentialState, DAY_MS, formatShare, SECURITY_AUDIT_ACTIONS } from "@/lib/superAdminInsights";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable, auditRowSelect } from "@/components/super-admin/AuditTable";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const ACTION_WINDOW_DAYS = 7;

export default async function SuperAdminSecurityPage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description="Account protection, sign-in methods, sensitive activity, and machine API access across the instance." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile className="rounded-2xl" label="Users with MFA" value={formatShare(mfaUsers, users)} hint={`${mfaUsers.toLocaleString()} of ${users.toLocaleString()} users`} progress={{ value: mfaUsers, max: Math.max(users, 1), tone: "success" }} />
        <StatTile className="rounded-2xl" label="Owners and admins without MFA" value={managersWithoutMfa.toLocaleString()} hint={`of ${managers.toLocaleString()} owners and admins`} tone={managersWithoutMfa > 0 ? "attention" : "default"} />
        <StatTile className="rounded-2xl" label="Unverified email" value={unverifiedUsers.toLocaleString()} hint={`${formatShare(unverifiedUsers, users)} of users`} />
        <StatTile className="rounded-2xl" label="Active API clients" value={activeClients.toLocaleString()} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <AdminPanel title="Sign-in methods">
          <MetricRows
            rows={[
              { label: "Users with a password", value: passwordUsers.toLocaleString() },
              ...providerGroups.map((group) => ({ label: `Linked ${group.provider} accounts`, value: group._count._all.toLocaleString() })),
              { label: "Unexpired database sessions", value: activeSessions.toLocaleString() },
            ]}
          />
        </AdminPanel>
        <AdminPanel title={`Sensitive actions (last ${ACTION_WINDOW_DAYS} days)`} description="Access changes, exports, and credential activity from the audit log.">
          {sortedActions.length === 0 ? (
            <EmptyState mood="sleepy">No sensitive actions recorded this week.</EmptyState>
          ) : (
            <MetricRows rows={sortedActions.map((row) => ({ label: <span className="font-mono text-sm">{row.action}</span>, value: row._count._all.toLocaleString() }))} />
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Recent sensitive activity" description="Latest 25 matching audit events. Metadata is redacted; use the Audit log page to search further.">
        <AuditTable events={recentSecurityEvents} label="Recent sensitive activity" empty="No sensitive activity recorded." />
      </AdminPanel>

      <AdminPanel title="Machine API clients" description="Tenant-bound API clients, their scopes, and credential lifecycle. Credential secrets and digests are never shown.">
        {apiClients.length === 0 ? (
          <EmptyState mood="sleepy">No API clients have been created.</EmptyState>
        ) : (
          <Table label="Machine API clients">
            <THead>
              <tr>
                <TH>Client</TH>
                <TH>Organisation</TH>
                <TH>Status</TH>
                <TH>Scopes</TH>
                <TH className="text-right">Credentials</TH>
                <TH>Last used</TH>
              </tr>
            </THead>
            <TBody>
              {apiClients.map((client) => {
                const states = client.credentials.map((credential) => credentialState(credential, now));
                const active = states.filter((state) => state === "active").length;
                const lastUsed = client.credentials.reduce<Date | null>((latest, credential) => (credential.lastUsedAt && (!latest || credential.lastUsedAt > latest) ? credential.lastUsedAt : latest), null);
                return (
                  <TR key={client.id}>
                    <TD className="align-top"><NameCell name={client.name} sub={`Created ${client.createdAt.toLocaleDateString()}`} /></TD>
                    <TD className="align-top"><NameCell href={`/super-admin/orgs/${client.organisation.id}`} name={client.organisation.name} sub={`/${client.organisation.slug}`} /></TD>
                    <TD className="align-top"><Chip size="sm" tone={client.status === ApiClientStatus.ACTIVE ? "success" : "neutral"}>{client.status === ApiClientStatus.ACTIVE ? "Active" : "Disabled"}</Chip></TD>
                    <TD className="align-top">
                      <span className="flex flex-wrap gap-1">
                        {client.scopes.length === 0 ? <span className="text-ink-muted">None</span> : client.scopes.map((scope) => <Chip key={scope.scope} size="sm" tone="outline" className="font-mono">{scope.scope}</Chip>)}
                      </span>
                    </TD>
                    <TD className="align-top text-right tabular-nums">{`${active} active / ${states.length}`}</TD>
                    <TD className="align-top whitespace-nowrap text-ink-secondary">{lastUsed ? lastUsed.toLocaleString() : "Never"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </AdminPanel>
    </div>
  );
}
