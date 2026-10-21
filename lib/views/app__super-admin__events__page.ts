import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { readPageParam, readSearchParam } from "@/lib/superAdminInsights";
type Props = {
  searchParams: Promise<{ q?: string | string[]; org?: string | string[]; page?: string | string[]; }>;
};

export async function loadSuperAdminEventsView({ searchParams }: Props) {
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = readSearchParam(sp.q);
  const org = readSearchParam(sp.org, 64);
  const page = readPageParam(sp.page);
  const take = 50;
  const skip = page * take;
  // One extra row tells the pager whether a next page exists.
  const rows = await prisma.event.findMany({
    where: {
      ...(org ? { organisationId: org } : {}),
      ...(q
        ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            {
              organisation: { name: { contains: q, mode: "insensitive" } },
            },
          ],
        }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    skip,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      privacyType: true,
      startDateTime: true,
      createdAt: true,
      organisation: { select: { id: true, slug: true, name: true } },
      _count: { select: { rsvps: true } },
    },
  });
  const events = rows.slice(0, take);
  const checkedIn = events.length === 0
    ? new Map<string, number>()
    : await prisma.rSVP
      .groupBy({ by: ["eventId"], where: { eventId: { in: events.map((e) => e.id) }, checkedInAt: { not: null } }, _count: { _all: true } })
      .then((rows) => new Map(rows.map((row) => [row.eventId ?? "", row._count._all])));
  return { q, org, events, checkedIn, page, hasNext: rows.length > take };
}
