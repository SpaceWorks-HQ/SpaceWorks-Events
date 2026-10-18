import { requireSuperAdminMfa } from "@/lib/permissions";
import Link from "next/link";
import { ApiClientStatus, MembershipRole, OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { minutesAgo } from "@/lib/superAdminInsights";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminOverviewPage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const [
    orgs,
    users,
    events,
    series,
    instances,
    rsvps,
    memberships,
    orgInvites,
    checkIns,
    feedbackResponses,
    broadcasts,
    apiClients,
    failedEmails,
    stuckEmails,
    managersWithoutMfa,
    unverifiedUsers,
  ] = await Promise.all([
    prisma.organisation.count(),
    prisma.user.count(),
    prisma.event.count(),
    prisma.eventSeries.count(),
    prisma.eventInstance.count(),
    prisma.rSVP.count(),
    prisma.membership.count(),
    prisma.organisationInvite.count(),
    prisma.rSVP.count({ where: { checkedInAt: { not: null } } }),
    prisma.eventFeedbackResponse.count(),
    prisma.eventBroadcast.count(),
    prisma.apiClient.count({ where: { status: ApiClientStatus.ACTIVE } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.FAILED } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: minutesAgo(15) } } }),
    prisma.user.count({ where: { mfaEnabledAt: null, memberships: { some: { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } } } } }),
    prisma.user.count({ where: { emailVerified: null } }),
  ]);

  const [{ orgs24h, events24h, rsvps24h, rsvps7d }] = await prisma.$queryRaw<
    Array<{ orgs24h: bigint; events24h: bigint; rsvps24h: bigint; rsvps7d: bigint }>
  >`
    select
      (select count(*) from "Organisation" where "createdAt" >= (now() - interval '24 hours')) as "orgs24h",
      (select count(*) from "Event" where "createdAt" >= (now() - interval '24 hours')) as "events24h",
      (select count(*) from "RSVP" where "createdAt" >= (now() - interval '24 hours')) as "rsvps24h",
      (select count(*) from "RSVP" where "createdAt" >= (now() - interval '7 days')) as "rsvps7d"
  `.then((rows) => [
    {
      orgs24h: Number(rows?.[0]?.orgs24h ?? 0),
      events24h: Number(rows?.[0]?.events24h ?? 0),
      rsvps24h: Number(rows?.[0]?.rsvps24h ?? 0),
      rsvps7d: Number(rows?.[0]?.rsvps7d ?? 0),
    },
  ]);

  const activity7d = await prisma.$queryRaw<
    Array<{ day: string; orgs: bigint; events: bigint; rsvps: bigint }>
  >`
    with days as (
      select generate_series(
        date_trunc('day', now()) - interval '6 days',
        date_trunc('day', now()),
        interval '1 day'
      ) as day
    )
    select
      to_char(d.day, 'Mon DD') as day,
      (select count(*) from "Organisation" o where date_trunc('day', o."createdAt") = d.day) as orgs,
      (select count(*) from "Event" e where date_trunc('day', e."createdAt") = d.day) as events,
      (select count(*) from "RSVP" r where date_trunc('day', r."createdAt") = d.day) as rsvps
    from days d
    order by d.day asc
  `.then((rows) =>
    rows.map((r) => ({
      day: r.day,
      orgs: Number(r.orgs),
      events: Number(r.events),
      rsvps: Number(r.rsvps),
    })),
  );

  const [recentOrgs, recentEvents, topOrgsByEvents] = await Promise.all([
    prisma.organisation.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, slug: true, createdAt: true },
    }),
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        slug: true,
        createdAt: true,
        organisation: { select: { slug: true, name: true } },
      },
    }),
    prisma.organisation.findMany({
      orderBy: { events: { _count: "desc" } },
      take: 10,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { events: true, memberships: true } },
      },
    }),
  ]);

  // Top orgs by RSVPs is easiest via SQL join (kept small + read-only).
  const topOrgsByRsvps = await prisma
    .$queryRaw<Array<{ organisation_id: string; slug: string; name: string; rsvps: bigint }>>`
      select
        o.id as organisation_id,
        o.slug as slug,
        o.name as name,
        count(r.id) as rsvps
      from "Organisation" o
      left join "Event" e on e."organisationId" = o.id
      left join "RSVP" r on r."eventId" = e.id
      group by o.id, o.slug, o.name
      order by count(r.id) desc
      limit 10
    `
    .then((rows) =>
      rows.map((r) => ({
        organisation_id: r.organisation_id,
        slug: r.slug,
        name: r.name,
        rsvps: Number(r.rsvps),
      })),
    )
    .catch(() => []);

  const stats = [
    { label: "Organisations", value: orgs },
    { label: "Users", value: users },
    { label: "Events", value: events },
    { label: "RSVPs", value: rsvps },
    { label: "Series", value: series },
    { label: "Instances", value: instances },
    { label: "Memberships", value: memberships },
    { label: "Org invite links", value: orgInvites },
    { label: "Check-ins", value: checkIns },
    { label: "Feedback responses", value: feedbackResponses },
    { label: "Broadcasts", value: broadcasts },
    { label: "Active API clients", value: apiClients },
  ];

  const attention = [
    { label: "Failed emails", value: failedEmails, href: "/super-admin/email" },
    { label: "Emails queued over 15 minutes", value: stuckEmails, href: "/super-admin/email" },
    { label: "Owners and admins without MFA", value: managersWithoutMfa, href: "/super-admin/security" },
    { label: "Users with unverified email", value: unverifiedUsers, href: "/super-admin/users?filter=unverified" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="Instance-wide master data and operational controls." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <StatTile key={stat.label} className="rounded-2xl" label={stat.label} value={stat.value.toLocaleString()} />
        ))}
      </div>

      <AdminPanel title="Needs attention" description="Signals worth checking. Each links to the page with details.">
        <MetricRows
          rows={attention.map((item) => ({
            label: <Link href={item.href} className="underline-offset-4 hover:text-ink hover:underline">{item.label}</Link>,
            value: <span className={item.value > 0 ? "text-warning-fg" : "text-ink-muted"}>{item.value.toLocaleString()}</span>,
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
