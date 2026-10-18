import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/permissions";
import { getRequestOrigin } from "@/lib/publicUrl";

export async function loadApiAccessView({ params }: { params: Promise<{ orgSlug: string; }>; }) {
  const { orgSlug } = await params;
  const { organisation } = await requireOrgRole(orgSlug, "OWNER");
  const apiBaseUrl = `${await getRequestOrigin()}/api/v1`;
  const clients = await prisma.apiClient.findMany({
    where: { organisationId: organisation.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      scopes: { select: { scope: true }, orderBy: { scope: "asc" } },
      credentials: {
        select: { id: true, name: true, createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return { organisation, clients, apiBaseUrl };
}
