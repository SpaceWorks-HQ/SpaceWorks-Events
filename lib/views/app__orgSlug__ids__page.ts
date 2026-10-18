import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
type Props = { params: Promise<{ orgSlug: string; }>; };

export async function loadOrganisationIdsView({ params }: Props) {
  const { orgSlug } = await params;
  const organisation = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: {
      name: true,
      idProgrammes: { where: { status: "ACTIVE", registrationOpen: true }, orderBy: { createdAt: "desc" }, take: 50, select: { name: true, slug: true, description: true } },
    },
  });
  if (!organisation) notFound();
  return { organisation, orgSlug };
}
