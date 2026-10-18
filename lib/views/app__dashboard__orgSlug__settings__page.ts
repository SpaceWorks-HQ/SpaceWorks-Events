import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canDeleteOrg, requireOrgRole } from "@/lib/permissions";
type Props = { params: Promise<{ orgSlug: string; }>; };

export async function loadOrgSettingsView({ params }: Props) {

  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgRole(orgSlug, "ADMIN");

  const org = await prisma.organisation.findUnique({
    where: { id: organisation.id },
    select: { name: true, description: true, logoUrl: true, slug: true },
  });

  if (!org) notFound();

  const isOwner = membership.role === "OWNER";
  const canDelete = canDeleteOrg(membership);
  // Owner-only, tenant-scoped counts. "Active" means the client is enabled and
  // holds at least one credential that is neither revoked nor expired.
  const now = new Date();
  const [totalApiClients, activeApiClients] = isOwner
    ? await Promise.all([
      prisma.apiClient.count({ where: { organisationId: organisation.id } }),
      prisma.apiClient.count({
        where: {
          organisationId: organisation.id,
          status: "ACTIVE",
          credentials: { some: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
        },
      }),
    ])
    : [0, 0];


  return { org, organisation, membership, isOwner, canDelete, totalApiClients, activeApiClients };
}
