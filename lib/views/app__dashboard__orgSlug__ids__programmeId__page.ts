import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { type MemberRow } from "@/components/member-ids/MembersTable";
import { prisma } from "@/lib/db";
import { cardState, formatCardDate } from "@/lib/memberIds/core";
import { loadProgramme, memberPhotoUrl, publicOrigin } from "@/lib/memberIds/data";
import { isOrgAdmin, requireOrgMembership } from "@/lib/permissions";
type Props = {
  params: Promise<{ orgSlug: string; programmeId: string; }>;
  searchParams: Promise<{ tab?: string; q?: string; status?: string; page?: string; }>;
};
const TABS = [
  { id: "members", label: "Members" },
  { id: "import", label: "Import" },
  { id: "design", label: "Card design" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const STATUS_FILTERS = ["all", "PENDING", "APPROVED", "REJECTED", "REVOKED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const PAGE_SIZE = 100;
export async function loadIdProgrammeView({ params, searchParams }: Props) {

  const { orgSlug, programmeId } = await params;
  const query = await searchParams;
  const { organisation, membership } = await requireOrgMembership(orgSlug);
  const canManage = isOrgAdmin(membership.role);
  const programme = await loadProgramme(organisation.id, programmeId);
  if (!programme) notFound();
  const profile = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { logoUrl: true } });

  const requested = (TABS.find((tab) => tab.id === query.tab)?.id ?? "members") as Tab;
  const tab: Tab = canManage ? requested : "members";
  const base = `/dashboard/${organisation.slug}/ids/${programme.id}`;
  const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(query.status ?? "") ? (query.status as StatusFilter) : "all";
  const search = (query.q ?? "").trim().slice(0, 100);

  const counts = await prisma.idMember.groupBy({ by: ["status"], where: { programmeId: programme.id }, _count: { _all: true } });

  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const joinPath = `/${organisation.slug}/ids/${programme.slug}`;
  const origin = publicOrigin();


  const memberList = await (async () => {
    if (tab !== "members") return null;
    const where: Prisma.IdMemberWhereInput = {
      programmeId: programme.id,
      ...(status !== "all" ? { status } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { idNumber: { contains: search, mode: "insensitive" } }, ...(canManage ? [{ email: { contains: search.toLowerCase() } }] : [])] }
        : {}),
    };
    const filtered = await prisma.idMember.count({ where });
    const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
    const members = await prisma.idMember.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, organisationId: true, name: true, email: true, photoUrl: true, status: true, idNumber: true, expiresAt: true, fieldValues: true, statusReason: true, source: true },
    });
    // Emails and answers reach the browser only for owners and admins.
    const rows: MemberRow[] = members.map((member) => ({
      id: member.id,
      name: member.name,
      email: canManage ? member.email : null,
      photoUrl: memberPhotoUrl(member),
      status: member.status,
      state: cardState(member),
      idNumber: member.idNumber,
      validUntil: member.status === "APPROVED" || member.status === "REVOKED" ? formatCardDate(member.expiresAt) ?? "No expiry" : null,
      values: canManage && member.fieldValues && typeof member.fieldValues === "object" && !Array.isArray(member.fieldValues) ? (member.fieldValues as Record<string, string>) : {},
      reason: canManage ? member.statusReason : null,
      source: member.source,
    }));

    return { filtered, pages, page, rows };
  })();
  return { organisation, canManage, programme, profile, tab, base, status, search, counts, total, joinPath, origin, memberList };
}
