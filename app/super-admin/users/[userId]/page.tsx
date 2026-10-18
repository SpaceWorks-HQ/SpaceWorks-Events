import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminUserDetailView } from "@/lib/views/app__super-admin__users__userId__page";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RsvpStatus } from "@prisma/client";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { Avatar, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ userId: string; }>;
};

/** Support lookup for one person: account posture, organisations, registrations, and their audit trail. */
export default async function SuperAdminUserDetailPage({ params }: Props) {
  await requireSuperAdminMfa();
  const { user, hasPassword, accounts, activeSessions, memberships, rsvpStatuses, checkedIn, rsvps, auditEvents, displayName } = await loadSuperAdminUserDetailView({ params });
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/super-admin/users" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Users
        </Link>
        <div className="flex items-center gap-4">
          <Avatar name={displayName} src={user.profileImageUrl ?? user.image} size="lg" />
          <div className="min-w-0">
            <h1 className="break-words text-h1 text-ink">{displayName}</h1>
            <p className="mt-0.5 text-sm text-ink-muted [overflow-wrap:anywhere]">{user.email ?? "No email"} · Joined {user.createdAt.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Email verified" : "Email not verified"}</Chip>
          <Chip tone={user.mfaEnabledAt ? "success" : "neutral"}>{user.mfaEnabledAt ? `MFA since ${user.mfaEnabledAt.toLocaleDateString()}` : "MFA off"}</Chip>
          <Chip tone="outline">{hasPassword > 0 ? "Password set" : "No password"}</Chip>
          {accounts.map((account) => <Chip key={account.id} tone="outline">{`${account.provider} (${account.type})`}</Chip>)}
          <Chip tone="outline" className="tabular-nums">{user.id}</Chip>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <AdminPanel title="Summary">
          <MetricRows
            rows={[
              { label: "Organisations", value: user._count.memberships.toLocaleString() },
              { label: "Event collaborations", value: user._count.eventCollaborations.toLocaleString() },
              { label: "Sessions (unexpired / total)", value: `${activeSessions} / ${user._count.sessions}` },
              { label: "Registrations", value: user._count.rsvps.toLocaleString() },
              ...Object.values(RsvpStatus).map((status) => ({ label: `· ${status.toLowerCase().replace("_", " ")}`, value: (rsvpStatuses.find((row) => row.status === status)?._count._all ?? 0).toLocaleString() })),
              { label: "Checked in", value: checkedIn.toLocaleString() },
            ]}
          />
        </AdminPanel>

        <AdminPanel title="Organisations">
          {memberships.length === 0 ? (
            <EmptyState mood="sleepy">Not a member of any organisation.</EmptyState>
          ) : (
            <Table label="Organisation memberships">
              <THead>
                <tr>
                  <TH>Organisation</TH>
                  <TH>Role</TH>
                  <TH>Joined</TH>
                </tr>
              </THead>
              <TBody>
                {memberships.map((membership) => (
                  <TR key={membership.id}>
                    <TD><NameCell href={`/super-admin/orgs/${membership.organisation.id}`} name={membership.organisation.name} sub={`/${membership.organisation.slug}`} /></TD>
                    <TD><Chip size="sm" tone={membership.role === "OWNER" ? "ink" : "neutral"}>{membership.role}</Chip></TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{membership.createdAt.toLocaleDateString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Recent registrations" description="Latest 20. Tickets, check-in codes, and registration answers are not shown.">
        {rsvps.length === 0 ? (
          <EmptyState mood="sleepy">No registrations.</EmptyState>
        ) : (
          <Table label="Recent registrations">
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH>Checked in</TH>
                <TH>Registered</TH>
              </tr>
            </THead>
            <TBody>
              {rsvps.map((rsvp) => {
                const organisation = rsvp.event?.organisation ?? rsvp.eventInstance?.series.organisation ?? null;
                const title = rsvp.event?.title ?? (rsvp.eventInstance ? `${rsvp.eventInstance.series.title} · ${rsvp.eventInstance.startDateTime.toLocaleDateString()}` : "Deleted event");
                return (
                  <TR key={rsvp.id}>
                    <TD><NameCell name={title} sub={organisation ? <Link href={`/super-admin/orgs/${organisation.id}`} className="underline-offset-4 hover:underline">{organisation.name}</Link> : undefined} /></TD>
                    <TD><Chip size="sm" tone={rsvp.status === "CONFIRMED" ? "success" : rsvp.status === "REJECTED" ? "danger" : "neutral"}>{rsvp.status}</Chip></TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{rsvp.checkedInAt ? rsvp.checkedInAt.toLocaleString() : "—"}</TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{rsvp.createdAt.toLocaleString()}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <AdminPanel title="Recent actions by this user" description="Latest 20 audit events where this user was the actor.">
        <AuditTable events={auditEvents} label="Recent actions by this user" empty="No audit events for this user." />
      </AdminPanel>
    </div>
  );
}
