import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditRowSelect } from "@/components/super-admin/AuditTable";
import { readPageParam, readSearchParam } from "@/lib/superAdminInsights";
type Props = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[]; }>;
};

export async function loadSuperAdminAuditView({ searchParams }: Props) {
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = readSearchParam(sp.q);
  const page = readPageParam(sp.page);
  const take = 50;
  // One extra row tells the pager whether a next page exists.
  const rows = await prisma.auditEvent.findMany({
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
    take: take + 1,
    select: auditRowSelect,
  });
  return { q, events: rows.slice(0, take), page, hasNext: rows.length > take };
}
