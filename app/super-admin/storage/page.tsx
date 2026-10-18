import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AdminPanel, NameCell } from "@/components/super-admin/AdminPanel";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { formatBytes } from "@/lib/superAdminInsights";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminStoragePage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  let dbSizeBytes: number | null = null;
  let tableSizes:
    | Array<{ table_name: string; total_bytes: number; total_pretty: string }>
    | null = null;

  try {
    const dbRows = await prisma.$queryRaw<Array<{ bytes: bigint }>>`
      select pg_database_size(current_database()) as bytes
    `;
    dbSizeBytes = dbRows?.[0]?.bytes ? Number(dbRows[0].bytes) : null;

    tableSizes = await prisma.$queryRaw<
      Array<{ table_name: string; total_bytes: bigint; total_pretty: string }>
    >`
      select
        relname as table_name,
        pg_total_relation_size(quote_ident(relname)) as total_bytes,
        pg_size_pretty(pg_total_relation_size(quote_ident(relname))) as total_pretty
      from pg_stat_user_tables
      order by pg_total_relation_size(quote_ident(relname)) desc
      limit 25
    `.then((rows) =>
      rows.map((r) => ({
        table_name: r.table_name,
        total_bytes: Number(r.total_bytes),
        total_pretty: r.total_pretty,
      })),
    );
  } catch {
    // Some managed Postgres setups restrict these functions. We'll degrade gracefully.
  }

  const perOrgCounts = await prisma.organisation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { events: true, eventSeries: true, memberships: true } },
    },
  });

  const assetTotals = await prisma.asset
    .groupBy({
      by: ["organisationId"],
      _sum: { byteSize: true },
      where: { organisationId: { not: null }, byteSize: { not: null } },
    })
    .then((rows) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const orgId = r.organisationId;
        if (!orgId) continue;
        const bytes = r._sum.byteSize ? Number(r._sum.byteSize) : 0;
        m.set(orgId, bytes);
      }
      return m;
    })
    .catch(() => new Map<string, number>());

  const [assetSummary, assetsByType, recentAssets] = await Promise.all([
    prisma.asset.aggregate({ _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.asset.groupBy({ by: ["provider", "contentType"], _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.asset.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      // Object keys and URLs stay private; only type, size, and owner are shown.
      select: { id: true, contentType: true, byteSize: true, provider: true, createdAt: true, organisation: { select: { id: true, name: true } } },
    }),
  ]);
  const sortedTypes = [...assetsByType].sort((a, b) => Number(b._sum.byteSize ?? 0) - Number(a._sum.byteSize ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Storage" description="Database size, largest tables, and each organisation's footprint." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          className="rounded-2xl"
          label="Database size"
          value={dbSizeBytes == null ? "—" : formatBytes(dbSizeBytes)}
          hint={dbSizeBytes == null ? "Unavailable (DB functions may be restricted)." : undefined}
        />
        <StatTile className="rounded-2xl" label="Stored files" value={assetSummary._count._all.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Stored file size" value={formatBytes(assetSummary._sum.byteSize == null ? 0 : Number(assetSummary._sum.byteSize))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Files by provider and type">
          {sortedTypes.length === 0 ? (
            <EmptyState mood="sleepy">No tracked files.</EmptyState>
          ) : (
            <Table label="Files by provider and type">
              <THead>
                <tr>
                  <TH>Provider</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Files</TH>
                  <TH className="text-right">Size</TH>
                </tr>
              </THead>
              <TBody>
                {sortedTypes.map((row) => (
                  <TR key={`${row.provider}:${row.contentType ?? ""}`}>
                    <TD className="font-mono text-sm">{row.provider}</TD>
                    <TD className="font-mono text-sm">{row.contentType ?? "unknown"}</TD>
                    <TD className="text-right tabular-nums">{row._count._all.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{formatBytes(row._sum.byteSize == null ? 0 : Number(row._sum.byteSize))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>

        <AdminPanel title="Recent uploads" description="Latest 15 tracked files. Storage keys and URLs are not shown.">
          {recentAssets.length === 0 ? (
            <EmptyState mood="sleepy">No tracked files.</EmptyState>
          ) : (
            <Table label="Recent uploads">
              <THead>
                <tr>
                  <TH>Organisation</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Size</TH>
                  <TH>Uploaded</TH>
                </tr>
              </THead>
              <TBody>
                {recentAssets.map((asset) => (
                  <TR key={asset.id}>
                    <TD>{asset.organisation ? <NameCell href={`/super-admin/orgs/${asset.organisation.id}`} name={asset.organisation.name} /> : "—"}</TD>
                    <TD className="font-mono text-sm">{asset.contentType ?? "unknown"}</TD>
                    <TD className="text-right tabular-nums">{formatBytes(asset.byteSize == null ? null : Number(asset.byteSize))}</TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{asset.createdAt.toLocaleString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Largest tables (top 25)">
        {tableSizes == null ? (
          <p className="text-body-ui text-ink-muted">Unavailable (DB functions may be restricted).</p>
        ) : (
          <Table label="Largest tables">
            <THead>
              <tr>
                <TH>Table</TH>
                <TH className="text-right">Bytes</TH>
                <TH className="text-right">Pretty</TH>
              </tr>
            </THead>
            <TBody>
              {tableSizes.map((t) => (
                <TR key={t.table_name}>
                  <TD className="font-mono text-sm">{t.table_name}</TD>
                  <TD className="text-right tabular-nums">{t.total_bytes.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{t.total_pretty}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <AdminPanel title="Per-org logical footprint (counts)">
        <Table label="Per-org logical footprint">
          <THead>
            <tr>
              <TH>Org</TH>
              <TH className="text-right">Assets bytes</TH>
              <TH className="text-right">Members</TH>
              <TH className="text-right">Events</TH>
              <TH className="text-right">Series</TH>
            </tr>
          </THead>
          <TBody>
            {perOrgCounts.map((o) => (
              <TR key={o.id}>
                <TD><NameCell href={`/super-admin/orgs/${o.id}`} name={o.name} sub={`/${o.slug}`} /></TD>
                <TD className="text-right tabular-nums">{formatBytes(assetTotals.get(o.id) ?? 0)}</TD>
                <TD className="text-right tabular-nums">{o._count.memberships}</TD>
                <TD className="text-right tabular-nums">{o._count.events}</TD>
                <TD className="text-right tabular-nums">{o._count.eventSeries}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
