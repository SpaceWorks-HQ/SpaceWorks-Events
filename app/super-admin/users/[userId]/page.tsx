import { requireSuperAdminMfa } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable, auditRowSelect } from "@/components/super-admin/AuditTable";
import { Avatar, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ userId: string }>;
};

/** Support lookup for one person: account posture, organisations, registrations, and their audit trail. */
export default async function SuperAdminUserDetailPage({ params }: Props) {
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

  if (!user) {
    return <EmptyState mood="sad">User not found.</EmptyState>;
  }

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
          <Chip tone="outline" className="font-mono">{user.id}</Chip>
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
