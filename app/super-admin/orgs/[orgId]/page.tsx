import { requireSuperAdminMfa } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { AdminPanel, LinkRow, NameCell, StatusValue } from "@/components/super-admin/AdminPanel";
import { AuditTable, auditRowSelect } from "@/components/super-admin/AuditTable";
import { credentialState, formatBytes } from "@/lib/superAdminInsights";
import { Chip, EmptyState, OrgLogo, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ orgId: string }>;
};

export default async function SuperAdminOrgDetailPage({ params }: Props) {
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

  if (!org) {
    return <EmptyState mood="sad">Organisation not found.</EmptyState>;
  }

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
        token: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        createdBy: { select: { email: true } },
        usedBy: { select: { email: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/super-admin/orgs" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Organisations
        </Link>
        <div className="flex items-center gap-4">
          <OrgLogo name={org.name} src={org.logoUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="break-words text-h1 text-ink">{org.name}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">Created {org.createdAt.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="outline" className="font-mono">{`/${org.slug}`}</Chip>
          <Chip tone="outline">{`${org._count.memberships} members`}</Chip>
          <Chip tone="outline">{`${org._count.events} events`}</Chip>
          <Chip tone="outline">{`${org._count.eventSeries} series`}</Chip>
        </div>
        <p className="max-w-[720px] whitespace-pre-wrap text-body-ui text-ink-secondary">{org.description || "—"}</p>
        <LinkRow links={[{ href: `/${org.slug}`, label: "Public page" }, { href: `/dashboard/${org.slug}`, label: "Org dashboard" }]} />
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile className="rounded-2xl" label="Registrations" value={rsvpCount.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Checked in" value={checkedInCount.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Feedback responses" value={feedbackCount.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Broadcasts" value={broadcastStats._count._all.toLocaleString()} hint={`${(broadcastStats._sum.recipientCount ?? 0).toLocaleString()} recipients`} />
        <StatTile className="rounded-2xl" label="Stored files" value={assetStats._count._all.toLocaleString()} hint={formatBytes(assetStats._sum.byteSize == null ? 0 : Number(assetStats._sum.byteSize))} />
      </div>

      <AdminPanel title="Members">
        <Table label="Members">
          <THead>
            <tr>
              <TH>User</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Joined</TH>
            </tr>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>{m.user ? <NameCell href={`/super-admin/users/${m.user.id}`} name={m.user.name ?? "—"} /> : "—"}</TD>
                <TD className="font-mono text-sm">{m.user?.email ?? "—"}</TD>
                <TD><Chip size="sm" tone={m.role === "OWNER" ? "ink" : "neutral"}>{m.role}</Chip></TD>
                <TD className="whitespace-nowrap text-ink-secondary">{m.createdAt.toLocaleString()}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Events">
        <Table label="Events">
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Status</TH>
              <TH>Privacy</TH>
              <TH>Start</TH>
              <TH className="text-right">RSVPs</TH>
              <TH>Links</TH>
            </tr>
          </THead>
          <TBody>
            {events.length === 0 ? (
              <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No events.</TD></tr>
            ) : (
              events.map((e) => (
                <TR key={e.id}>
                  <TD className="font-semibold">{e.title}</TD>
                  <TD><StatusValue status={e.status} /></TD>
                  <TD><Chip size="sm" tone="outline">{e.privacyType}</Chip></TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{e.startDateTime.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{e._count.rsvps}</TD>
                  <TD><LinkRow links={[{ href: `/${org.slug}/${e.slug}`, label: "Public" }, { href: `/dashboard/${org.slug}/event/${e.id}`, label: "Manage" }]} /></TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Series">
        <Table label="Series">
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Status</TH>
              <TH>Privacy</TH>
              <TH className="text-right">Instances</TH>
              <TH className="text-right">Invites</TH>
              <TH>Link</TH>
            </tr>
          </THead>
          <TBody>
            {series.length === 0 ? (
              <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No series.</TD></tr>
            ) : (
              series.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold">{s.title}</TD>
                  <TD><StatusValue status={s.status} /></TD>
                  <TD><Chip size="sm" tone="outline">{s.privacyType}</Chip></TD>
                  <TD className="text-right tabular-nums">{s._count.instances}</TD>
                  <TD className="text-right tabular-nums">{s._count.invites}</TD>
                  <TD><LinkRow links={[{ href: `/dashboard/${org.slug}/series/${s.id}`, label: "Manage" }]} /></TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Org invite links">
        <Table label="Org invite links">
          <THead>
            <tr>
              <TH>Role</TH>
              <TH>Created</TH>
              <TH>Expires</TH>
              <TH>Used</TH>
              <TH>Created by</TH>
              <TH>Used by</TH>
            </tr>
          </THead>
          <TBody>
            {invites.length === 0 ? (
              <tr><TD colSpan={6} className="py-8 text-center text-ink-muted">No org invites.</TD></tr>
            ) : (
              invites.map((i) => (
                <TR key={i.id}>
                  <TD>{i.role}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.createdAt.toLocaleString()}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.expiresAt ? i.expiresAt.toLocaleString() : "—"}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.usedAt ? i.usedAt.toLocaleString() : "—"}</TD>
                  <TD className="font-mono text-sm">{i.createdBy.email ?? "—"}</TD>
                  <TD className="font-mono text-sm">{i.usedBy?.email ?? "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Machine API clients" description="Scopes and credential lifecycle only. Credential secrets and digests are never shown.">
        {apiClients.length === 0 ? (
          <EmptyState mood="sleepy">No API clients.</EmptyState>
        ) : (
          <Table label="Machine API clients">
            <THead>
              <tr>
                <TH>Client</TH>
                <TH>Status</TH>
                <TH>Scopes</TH>
                <TH className="text-right">Credentials</TH>
                <TH>Last used</TH>
              </tr>
            </THead>
            <TBody>
              {apiClients.map((client) => {
                const active = client.credentials.filter((credential) => credentialState(credential, now) === "active").length;
                const lastUsed = client.credentials.reduce<Date | null>((latest, credential) => (credential.lastUsedAt && (!latest || credential.lastUsedAt > latest) ? credential.lastUsedAt : latest), null);
                return (
                  <TR key={client.id}>
                    <TD className="font-semibold">{client.name}</TD>
                    <TD><Chip size="sm" tone={client.status === "ACTIVE" ? "success" : "neutral"}>{client.status === "ACTIVE" ? "Active" : "Disabled"}</Chip></TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {client.scopes.length === 0 ? <span className="text-ink-muted">None</span> : client.scopes.map((scope) => <Chip key={scope.scope} size="sm" tone="outline" className="font-mono">{scope.scope}</Chip>)}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{`${active} active / ${client.credentials.length}`}</TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{lastUsed ? lastUsed.toLocaleString() : "Never"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <AdminPanel title="Recent activity" description="Latest 25 audit events for this organisation. Metadata is redacted.">
        <AuditTable events={auditEvents} label="Recent organisation activity" empty="No audit events for this organisation." hideOrganisation />
      </AdminPanel>
    </div>
  );
}
