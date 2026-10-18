import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AdminPanel, NameCell } from "@/components/super-admin/AdminPanel";
import { PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminInvitesPage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const [orgInvites, eventInvites, seriesInvites] = await Promise.all([
    prisma.organisationInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        token: true,
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Invites" description="Organisation invite links and event and series invites across the instance." />

      <AdminPanel title="Organisation invite links">
        <Table label="Organisation invite links">
          <THead>
            <tr>
              <TH>Org</TH>
              <TH>Role</TH>
              <TH>Created</TH>
              <TH>Expires</TH>
              <TH>Used</TH>
              <TH>Created by</TH>
              <TH>Used by</TH>
            </tr>
          </THead>
          <TBody>
            {orgInvites.length === 0 ? (
              <tr><TD colSpan={7} className="py-8 text-center text-ink-muted">No org invites.</TD></tr>
            ) : (
              orgInvites.map((i) => (
                <TR key={i.id}>
                  <TD><NameCell href={`/super-admin/orgs/${i.organisation.id}`} name={i.organisation.name} sub={`/${i.organisation.slug}`} /></TD>
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

      <AdminPanel title="Event invites">
        <Table label="Event invites">
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Org</TH>
              <TH>Email</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {eventInvites.length === 0 ? (
              <tr><TD colSpan={4} className="py-8 text-center text-ink-muted">No event invites.</TD></tr>
            ) : (
              eventInvites.map((i) => (
                <TR key={i.id}>
                  <TD className="font-semibold">{i.event.title}</TD>
                  <TD><NameCell href={`/super-admin/orgs/${i.event.organisation.id}`} name={i.event.organisation.name} /></TD>
                  <TD className="font-mono text-sm">{i.email}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.createdAt.toLocaleString()}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Series invites">
        <Table label="Series invites">
          <THead>
            <tr>
              <TH>Series</TH>
              <TH>Org</TH>
              <TH>Email</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {seriesInvites.length === 0 ? (
              <tr><TD colSpan={4} className="py-8 text-center text-ink-muted">No series invites.</TD></tr>
            ) : (
              seriesInvites.map((i) => (
                <TR key={i.id}>
                  <TD className="font-semibold">{i.series.title}</TD>
                  <TD><NameCell href={`/super-admin/orgs/${i.series.organisation.id}`} name={i.series.organisation.name} /></TD>
                  <TD className="font-mono text-sm">{i.email}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{i.createdAt.toLocaleString()}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
