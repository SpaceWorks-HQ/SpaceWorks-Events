import { requireSuperAdminMfa } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readPageParam, readSearchParam } from "@/lib/superAdminInsights";
type Props = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[]; filter?: string | string[]; }>;
};
const filters = {
  all: { label: "All", where: {} },
  unverified: { label: "Unverified email", where: { emailVerified: null } },
  "no-mfa": { label: "Without MFA", where: { mfaEnabledAt: null } },
  mfa: { label: "With MFA", where: { mfaEnabledAt: { not: null } } },
} satisfies Record<string, { label: string; where: Prisma.UserWhereInput; }>;
type FilterKey = keyof typeof filters;

export async function loadSuperAdminUsersView({ searchParams }: Props) {
  await requireSuperAdminMfa();
  const sp = await searchParams;
  const q = readSearchParam(sp.q);
  const requestedFilter = readSearchParam(sp.filter, 20);
  // Own keys only: `in` would also accept inherited names such as "toString".
  const filter: FilterKey = Object.hasOwn(filters, requestedFilter) ? (requestedFilter as FilterKey) : "all";
  const page = readPageParam(sp.page);
  const take = 50;
  const skip = page * take;
  // One extra row tells the pager whether a next page exists.
  const rows = await prisma.user.findMany({
    where: {
      ...filters[filter].where,
      ...(q
        ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    skip,
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      mfaEnabledAt: true,
      createdAt: true,
      _count: {
        select: { memberships: true, accounts: true, sessions: true, rsvps: true },
      },
    },
  });
  return { q, filter, users: rows.slice(0, take), page, hasNext: rows.length > take };
}
