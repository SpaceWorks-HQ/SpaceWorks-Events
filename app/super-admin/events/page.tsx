import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminEventsView } from "@/lib/views/app__super-admin__events__page";
import { AdminPager, AdminSearchForm, LinkRow, NameCell, StatusValue } from "@/components/super-admin/AdminPanel";
import { Chip, PageHeader } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  searchParams: Promise<{ q?: string; org?: string; page?: string; }>;
};

export default async function SuperAdminEventsPage({ searchParams }: Props) {
  await requireSuperAdminMfa();
  const { q, org, events, checkedIn, page } = await loadSuperAdminEventsView({ searchParams });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Events" description="Events across every organisation, newest first." />
      <AdminSearchForm action="/super-admin/events" label="Search by title, slug, org" defaultValue={q} submitLabel="Apply">
        <label className="flex flex-col gap-1.5 sm:w-60">
          <span className="text-label text-ink">Filter by orgId</span>
          <Input name="org" defaultValue={org} />
        </label>
      </AdminSearchForm>

      <Table label="Events">
        <THead>
          <tr>
            <TH>Event</TH>
            <TH>Org</TH>
            <TH>Status</TH>
            <TH>Privacy</TH>
            <TH>Start</TH>
            <TH className="text-right">RSVPs</TH>
            <TH className="text-right">Checked in</TH>
            <TH>Links</TH>
          </tr>
        </THead>
        <TBody>
          {events.length === 0 ? (
            <tr><TD colSpan={8} className="py-8 text-center text-ink-muted">No events.</TD></tr>
          ) : (
            events.map((e) => (
              <TR key={e.id}>
                <TD><NameCell name={e.title} sub={e.id} /></TD>
                <TD><NameCell name={e.organisation.name} sub={`/${e.organisation.slug}`} /></TD>
                <TD><StatusValue status={e.status} /></TD>
                <TD><Chip size="sm" tone="outline">{e.privacyType}</Chip></TD>
                <TD className="whitespace-nowrap text-ink-secondary">{e.startDateTime.toLocaleString()}</TD>
                <TD className="text-right tabular-nums">{e._count.rsvps}</TD>
                <TD className="text-right tabular-nums">{checkedIn.get(e.id) ?? 0}</TD>
                <TD>
                  <LinkRow links={[{ href: `/${e.organisation.slug}/${e.slug}`, label: "Public" }, { href: `/dashboard/${e.organisation.slug}/event/${e.id}`, label: "Manage" }, { href: `/super-admin/orgs/${e.organisation.id}`, label: "Org" }]} />
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/events" query={q} page={page} extra={`&org=${encodeURIComponent(org)}`} />
    </div>
  );
}
