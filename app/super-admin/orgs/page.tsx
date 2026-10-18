import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AdminPager, AdminSearchForm, LinkRow } from "@/components/super-admin/AdminPanel";
import { PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function SuperAdminOrgsPage({ searchParams }: Props) {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;
  const skip = page * take;

  const orgs = await prisma.organisation.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take,
    skip,
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: {
        select: { events: true, eventSeries: true, memberships: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Organisations" description="Every organisation on this instance, newest first." />
      <AdminSearchForm action="/super-admin/orgs" label="Search by name or slug" defaultValue={q} />

      <Table label="Organisations">
        <THead>
          <tr>
            <TH>Name</TH>
            <TH>Slug</TH>
            <TH className="text-right">Members</TH>
            <TH className="text-right">Events</TH>
            <TH className="text-right">Series</TH>
            <TH>Created</TH>
            <TH>Link</TH>
          </tr>
        </THead>
        <TBody>
          {orgs.length === 0 ? (
            <tr><TD colSpan={7} className="py-8 text-center text-ink-muted">No organisations.</TD></tr>
          ) : (
            orgs.map((o) => (
              <TR key={o.id}>
                <TD className="font-semibold">{o.name}</TD>
                <TD className="font-mono text-sm">{o.slug}</TD>
                <TD className="text-right tabular-nums">{o._count.memberships}</TD>
                <TD className="text-right tabular-nums">{o._count.events}</TD>
                <TD className="text-right tabular-nums">{o._count.eventSeries}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{o.createdAt.toLocaleString()}</TD>
                <TD>
                  <LinkRow links={[{ href: `/super-admin/orgs/${o.id}`, label: "View" }, { href: `/${o.slug}`, label: "Public" }, { href: `/dashboard/${o.slug}`, label: "Dashboard" }]} />
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/orgs" query={q} page={page} />
    </div>
  );
}
