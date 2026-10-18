import { prisma } from "@/lib/db";
import { getDashboardHome } from "@/lib/dashboardHome";
export async function loadDashboardView() {

  const session = await requireAuth();
  const userId = session.user.id;
  const now = new Date();

  const [home, collaboratorGrants] = await Promise.all([
    getDashboardHome(userId, now),
    prisma.eventCollaborator.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        event: { select: { id: true, title: true, organisation: { select: { id: true, name: true, slug: true } } } },
        series: { select: { id: true, title: true, organisation: { select: { id: true, name: true, slug: true } } } },
      },
    }),
  ]);

  const membershipOrganisationIds = new Set(home.organisations.map((organisation) => organisation.id));
  const coOrganizedEvents = collaboratorGrants.flatMap((grant) => {
    const item = grant.event
      ? { id: grant.event.id, title: grant.event.title, organisation: grant.event.organisation, href: `/dashboard/${grant.event.organisation.slug}/event/${grant.event.id}`, label: "Event" }
      : grant.series
        ? { id: grant.series.id, title: grant.series.title, organisation: grant.series.organisation, href: `/dashboard/${grant.series.organisation.slug}/series/${grant.series.id}`, label: "Series" }
        : null;
    return item && !membershipOrganisationIds.has(item.organisation.id) ? [{ ...item, permissions: grant.permissions }] : [];
  });

  const fullName = session.user.name?.trim() || "there";
  const firstName = fullName.split(/\s+/)[0];
  const hasOrganisations = home.organisations.length > 0;
  const showOrganisationOnRows = home.organisations.length > 1;
  const singleAdminOrg = home.adminOrganisations.length === 1 ? home.adminOrganisations[0] : null;
  const firstRunOnly = home.setup !== null && !home.setup.hasEvent;


  return { home, coOrganizedEvents, now, firstName, hasOrganisations, showOrganisationOnRows, singleAdminOrg, firstRunOnly };
}

import { requireAuth } from "@/lib/permissions";
