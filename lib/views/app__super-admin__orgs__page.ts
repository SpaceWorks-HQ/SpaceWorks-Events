import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { readPageParam, readSearchParam } from "@/lib/superAdminInsights";
type Props = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[]; }>;
};

export async function loadSuperAdminOrgsView({ searchParams }: Props) {
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = readSearchParam(sp.q);
  const page = readPageParam(sp.page);
  const take = 50;
  const skip = page * take;
  // One extra row tells the pager whether a next page exists.
  const rows = await prisma.organisation.findMany({
    where: q
      ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: take + 1,
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
  return { q, orgs: rows.slice(0, take), page, hasNext: rows.length > take };
}
