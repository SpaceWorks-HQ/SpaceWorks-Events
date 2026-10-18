import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AdminPager, AdminSearchForm } from "@/components/super-admin/AdminPanel";
import { AuditTable, auditRowSelect } from "@/components/super-admin/AuditTable";
import { PageHeader } from "@/components/ui/display";

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function SuperAdminAuditPage({ searchParams }: Props) {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;

  const events = await prisma.auditEvent.findMany({
    where: q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" } },
            { targetType: { contains: q, mode: "insensitive" } },
            { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
            { organisation: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    skip: page * take,
    take,
    select: auditRowSelect,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Append-only security and application activity. Sensitive values are redacted before display." />
      <AdminSearchForm action="/super-admin/audit" label="Search action, actor email, org, or target type" defaultValue={q} />
      <AuditTable events={events} label="Audit log" />
      <AdminPager basePath="/super-admin/audit" query={q} page={page} />
    </div>
  );
}
