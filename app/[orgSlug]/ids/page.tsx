import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/display";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orgSlug: string }> };

export const metadata: Metadata = { title: "ID cards", robots: { index: false, follow: false } };

/** An organisation's ID programmes that are taking requests. */
export default async function OrganisationIdsPage({ params }: Props) {
  const { orgSlug } = await params;
  const organisation = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: {
      name: true,
      idProgrammes: { where: { status: "ACTIVE", registrationOpen: true }, orderBy: { createdAt: "desc" }, take: 50, select: { name: true, slug: true, description: true } },
    },
  });
  if (!organisation) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <header>
        <p className="text-overline text-ink-muted">{organisation.name}</p>
        <h1 className="text-h1 text-ink">ID cards</h1>
      </header>
      {organisation.idProgrammes.length === 0 ? (
        <EmptyState title="No open ID programmes">{organisation.name} isn&apos;t taking card requests right now. Ask them for a direct link.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {organisation.idProgrammes.map((programme) => (
            <li key={programme.slug}>
              <Link href={`/${orgSlug}/ids/${programme.slug}`} className="block rounded-2xl border border-line bg-panel p-5 transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="block text-h4 text-ink">{programme.name}</span>
                {programme.description ? <span className="mt-1 line-clamp-2 block text-body-ui text-ink-secondary">{programme.description}</span> : null}
                <span className="mt-2 block text-label text-primary">Request your card</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
