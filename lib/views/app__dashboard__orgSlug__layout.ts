import { requireOrgDashboardAccess } from "@/lib/permissions";

export async function loadOrgSlugShell({
  params,
}: {

  params: Promise<{ orgSlug: string; }>;
}) {
  const { orgSlug } = await params;
  const { organisation } = await requireOrgDashboardAccess(orgSlug);
  return { organisation };
}
