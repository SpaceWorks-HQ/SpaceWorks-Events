import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
type Props = {
  searchParams: Promise<{ q?: string; org?: string; page?: string; }>;
};

export async function loadSuperAdminEventsView({ searchParams }: Props) {
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const org = (sp.org ?? "").trim();
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;
  const skip = page * take;
  const events = await prisma.event.findMany({
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
    take,
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
  const checkedIn = events.length === 0
    ? new Map<string, number>()
    : await prisma.rSVP
      .groupBy({ by: ["eventId"], where: { eventId: { in: events.map((e) => e.id) }, checkedInAt: { not: null } }, _count: { _all: true } })
      .then((rows) => new Map(rows.map((row) => [row.eventId ?? "", row._count._all])));
  return { q, org, events, checkedIn, page };
}
