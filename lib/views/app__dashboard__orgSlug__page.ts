import { prisma } from "@/lib/db";
import { canManageEvents, isOrgAdmin, requireOrgDashboardAccess } from "@/lib/permissions";
import { getOrgDashboard, type OrgEventView } from "@/lib/orgDashboard";
import { type OrgQuery } from "@/components/dashboard/org/OrgSections";
import type { Metadata } from "next";
type Props = {
  params: Promise<{ orgSlug: string; }>;
  searchParams: Promise<{ view?: string; q?: string; show?: string; month?: string; }>;
};
const VIEWS: OrgEventView[] = ["upcoming", "draft", "past"];
export async function loadRouteMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true },
  });
  return {
    title: org ? `${org.name} Dashboard` : "Dashboard",
  };
}
export async function loadOrgDashboardView({
  params,
  searchParams,
}: Props) {

  const { orgSlug } = await params;
  const sp = await searchParams;
  const query: OrgQuery = {
    view: VIEWS.includes(sp.view as OrgEventView) ? (sp.view as OrgEventView) : "upcoming",
    q: typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "",
    pages: Math.min(20, Math.max(1, parseInt(sp.show ?? "1", 10) || 1)),
    month: typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined,
  };

  const access = await requireOrgDashboardAccess(orgSlug);
  const { organisation, membership } = access;
  if (!membership) {
    const grants = await prisma.eventCollaborator.findMany({
      where: {
        userId: access.userId,
        OR: [
          { event: { organisationId: organisation.id } },
          { series: { organisationId: organisation.id } },
        ],
      },
      select: { id: true, event: { select: { id: true, title: true } }, series: { select: { id: true, title: true } } },
    }); return { collaborator: true as const, organisation, membership, grants };
  }
  const manage = canManageEvents(membership);
  const admin = isOrgAdmin(membership.role);
  const base = `/dashboard/${organisation.slug}`;
  const now = new Date();

  const profile = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { description: true, logoUrl: true } });
  const data = await getOrgDashboard({
    organisation: { id: organisation.id, slug: organisation.slug, logoUrl: profile.logoUrl, description: profile.description },
    canManage: manage,
    view: query.view,
    query: query.q,
    pages: query.pages,
    month: query.month,
    now,
  });
  const effectiveQuery: OrgQuery = { ...query, view: data.events.view };

  return { collaborator: false as const, organisation, membership, manage, admin, base, now, profile, data, effectiveQuery };
}
