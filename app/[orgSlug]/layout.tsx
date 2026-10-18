import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { OrganiserChrome } from "@/components/chrome/OrganiserChrome";
import { resolveShortLinkSegment } from "@/lib/shortLinkResolve";

/**
 * Organiser-branded chrome for every public organiser page (organisation,
 * event, programme, session, speaker, series date, feedback). Only public
 * organisation fields are read; the pages below still enforce their own
 * visibility rules and return not-found as before.
 */
export default async function OrganiserLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organisation = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true, slug: true, logoUrl: true },
  });
  // Resolve before anything streams so unknown addresses get a real 404 status
  // and short links (`/aB3x9Kq`) get a real temporary redirect. Codes always
  // contain an uppercase letter, so they never shadow an organisation slug.
  // Unknown, unreleased, and rate-limited codes are the same not-found.
  if (!organisation) {
    const destination = await resolveShortLinkSegment(orgSlug);
    if (destination) redirect(destination);
    notFound();
  }
  return <OrganiserChrome organisation={organisation}>{children}</OrganiserChrome>;
}
