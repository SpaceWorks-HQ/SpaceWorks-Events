import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
type Props = { params: Promise<{ orgSlug: string; programmeSlug: string; }>; };
async function loadPublicProgramme(orgSlug: string, programmeSlug: string) {
  if (programmeSlug.length > 120) return null;
  return prisma.idProgramme.findFirst({
    where: { slug: programmeSlug, organisation: { slug: orgSlug }, status: { not: "DRAFT" } },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      registrationOpen: true,
      requiresApproval: true,
      organisation: { select: { name: true } },
      fields: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { key: true, label: true, type: true, required: true, options: true } },
    },
  });
}

export async function loadRouteMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, programmeSlug } = await params;
  const programme = await loadPublicProgramme(orgSlug, programmeSlug);
  return { title: programme ? `${programme.name} · ${programme.organisation.name}` : "ID card", robots: { index: false, follow: false } };
}
export async function loadJoinIdProgrammeView({ params }: Props) {
  const { orgSlug, programmeSlug } = await params;
  const programme = await loadPublicProgramme(orgSlug, programmeSlug);
  if (!programme) notFound();
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }) : null;
  const email = user?.email?.toLowerCase() ?? null;
  const existing = userId
    ? await prisma.idMember.findFirst({
      where: { programmeId: programme.id, OR: [{ userId }, ...(email ? [{ email }] : [])] },
      select: { status: true, expiresAt: true },
    })
    : null;
  const open = programme.status === "ACTIVE" && programme.registrationOpen;
  const here = `/${orgSlug}/ids/${programmeSlug}`;
  return { programme, existing, open, userId, here, orgSlug, programmeSlug, user, email };
}
