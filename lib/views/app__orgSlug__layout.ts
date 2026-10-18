import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveShortLinkSegment } from "@/lib/shortLinkResolve";

export async function loadOrganiserShell({ params }: { params: Promise<{ orgSlug: string; }>; }) {
  const { orgSlug } = await params;
  const organisation = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true, slug: true, logoUrl: true },
  });
  if (!organisation) {
    const destination = await resolveShortLinkSegment(orgSlug);
    if (destination) redirect(destination);
    notFound();
  }
  return { organisation };
}
