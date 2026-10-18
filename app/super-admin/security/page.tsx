import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminSecurityView } from "@/lib/views/app__super-admin__security__page";
import { ApiClientStatus } from "@prisma/client";
import { credentialState, formatShare } from "@/lib/superAdminInsights";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const ACTION_WINDOW_DAYS = 7;

export default async function SuperAdminSecurityPage() {
  await requireSuperAdminMfa();
  const { mfaUsers, users, managersWithoutMfa, managers, unverifiedUsers, activeClients, passwordUsers, providerGroups, activeSessions, sortedActions, recentSecurityEvents, apiClients, now } = await loadSuperAdminSecurityView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description="Account protection, sign-in methods, sensitive activity, and machine API access across the instance." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile className="rounded-xl" label="Users with MFA" value={formatShare(mfaUsers, users)} hint={`${mfaUsers.toLocaleString()} of ${users.toLocaleString()} users`} progress={{ value: mfaUsers, max: Math.max(users, 1), tone: "success" }} />
        <StatTile className="rounded-xl" label="Owners and admins without MFA" value={managersWithoutMfa.toLocaleString()} hint={`of ${managers.toLocaleString()} owners and admins`} tone={managersWithoutMfa > 0 ? "attention" : "default"} />
        <StatTile className="rounded-xl" label="Unverified email" value={unverifiedUsers.toLocaleString()} hint={`${formatShare(unverifiedUsers, users)} of users`} />
        <StatTile className="rounded-xl" label="Active API clients" value={activeClients.toLocaleString()} />
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
            <MetricRows rows={sortedActions.map((row) => ({ label: <span className="tabular-nums text-sm">{row.action}</span>, value: row._count._all.toLocaleString() }))} />
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
                        {client.scopes.length === 0 ? <span className="text-ink-muted">None</span> : client.scopes.map((scope) => <Chip key={scope.scope} size="sm" tone="outline" className="tabular-nums">{scope.scope}</Chip>)}
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
