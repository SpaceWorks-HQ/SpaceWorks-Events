import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
type Props = {
  searchParams: Promise<{ q?: string; page?: string; }>;
};

export async function loadSuperAdminOrgsView({ searchParams }: Props) {
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
  return { q, orgs, page };
}
