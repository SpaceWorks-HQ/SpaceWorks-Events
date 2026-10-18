import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminOverviewView } from "@/lib/views/app__super-admin__page";
import Link from "next/link";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminOverviewPage() {
  await requireSuperAdminMfa();
  const { stats, attention, activity7d, orgs24h, events24h, rsvps24h, rsvps7d, topOrgsByEvents, topOrgsByRsvps, recentOrgs, recentEvents } = await loadSuperAdminOverviewView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="Instance-wide master data and operational controls." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <StatTile key={stat.label} className="rounded-xl" label={stat.label} value={stat.value.toLocaleString()} />
        ))}
      </div>

      <AdminPanel title="Needs attention" description="Signals worth checking. Each links to the page with details.">
        <MetricRows
          rows={attention.map((item) => ({
            label: <Link href={item.href} className="underline-offset-4 hover:text-ink hover:underline">{item.label}</Link>,
            value: <span className={item.value > 0 ? "inline-flex min-w-7 justify-center rounded-full bg-highlight px-2 text-on-highlight" : "text-ink-muted"}>{item.value.toLocaleString()}</span>,
          }))}
        />
      </AdminPanel>

      <div className="grid gap-3 md:grid-cols-3">
        <SparklineCard title="Orgs (7d)" subtitle="Created per day" points={activity7d.map((d) => ({ xLabel: d.day, y: d.orgs }))} />
        <SparklineCard title="Events (7d)" subtitle="Created per day" points={activity7d.map((d) => ({ xLabel: d.day, y: d.events }))} />
        <SparklineCard title="RSVPs (7d)" subtitle="Created per day" points={activity7d.map((d) => ({ xLabel: d.day, y: d.rsvps }))} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <AdminPanel title="Recent activity">
          <MetricRows
            rows={[
              { label: "Orgs created (24h)", value: orgs24h.toLocaleString() },
              { label: "Events created (24h)", value: events24h.toLocaleString() },
              { label: "RSVPs created (24h)", value: rsvps24h.toLocaleString() },
              { label: "RSVPs created (7d)", value: rsvps7d.toLocaleString() },
            ]}
          />
        </AdminPanel>
        <AdminPanel title="Top orgs">
          <Table label="Top orgs">
            <THead>
              <tr>
                <TH>Org</TH>
                <TH className="text-right">Events</TH>
                <TH className="text-right">Members</TH>
                <TH className="text-right">RSVPs</TH>
              </tr>
            </THead>
            <TBody>
              {topOrgsByEvents.map((o) => {
                const r = topOrgsByRsvps.find((x) => x.organisation_id === o.id);
                return (
                  <TR key={o.id}>
                    <TD><NameCell href={`/super-admin/orgs/${o.id}`} name={o.name} sub={`/${o.slug}`} /></TD>
                    <TD className="text-right tabular-nums">{o._count.events}</TD>
                    <TD className="text-right tabular-nums">{o._count.memberships}</TD>
                    <TD className="text-right tabular-nums">{r?.rsvps?.toLocaleString?.() ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </AdminPanel>
      </div>

      <div className="grid gap-6">
        <AdminPanel title="Recent organisations">
          <Table label="Recent organisations">
            <TBody>
              {recentOrgs.map((o) => (
                <TR key={o.id}>
                  <TD><NameCell href={`/super-admin/orgs/${o.id}`} name={o.name} sub={`/${o.slug}`} /></TD>
                  <TD className="text-right text-ink-secondary">{o.createdAt.toLocaleString()}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </AdminPanel>
        <AdminPanel title="Recent events">
          <Table label="Recent events">
            <TBody>
              {recentEvents.map((e) => (
                <TR key={e.id}>
                  <TD className="font-semibold">{e.title}</TD>
                  <TD><NameCell href={`/${e.organisation.slug}/${e.slug}`} name={`/${e.organisation.slug}/${e.slug}`} sub={e.organisation.name} /></TD>
                  <TD className="text-right text-ink-secondary">{e.createdAt.toLocaleString()}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </AdminPanel>
      </div>
    </div>
  );
}
