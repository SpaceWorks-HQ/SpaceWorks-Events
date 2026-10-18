import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinIdProgrammeForm } from "@/components/member-ids/JoinIdProgrammeForm";
import { MemberStatusPill } from "@/components/member-ids/StatusPill";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cardState } from "@/lib/memberIds/core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orgSlug: string; programmeSlug: string }> };

/** Draft programmes are not public; everything else shows its own state. */
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, programmeSlug } = await params;
  const programme = await loadPublicProgramme(orgSlug, programmeSlug);
  return { title: programme ? `${programme.name} · ${programme.organisation.name}` : "ID card", robots: { index: false, follow: false } };
}

export default async function JoinIdProgrammePage({ params }: Props) {
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

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-overline text-ink-muted">{programme.organisation.name} · ID card</p>
        <h1 className="break-words text-h1 text-ink">{programme.name}</h1>
        {programme.description ? <p className="whitespace-pre-line text-body text-ink-secondary">{programme.description}</p> : null}
      </header>

      {existing ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h3 text-ink">Your card</h2>
            <MemberStatusPill state={cardState(existing)} />
          </div>
          <p className="text-body-ui text-ink-secondary">
            {existing.status === "PENDING"
              ? `${programme.organisation.name} will look at your request soon. We'll show your card in your ID wallet once it's approved.`
              : existing.status === "APPROVED"
                ? "Your card is ready. Open your ID wallet to see it, flip it and download it."
                : existing.status === "REJECTED"
                  ? `${programme.organisation.name} didn't approve this request. Contact them if you think that's a mistake.`
                  : `${programme.organisation.name} has withdrawn this card. Contact them if you have questions.`}
          </p>
          {existing.status === "APPROVED" ? (
            <Button asChild variant="primary" className="self-start"><Link href="/account/ids">Open your ID wallet</Link></Button>
          ) : null}
        </section>
      ) : !open ? (
        <Callout tone="info" title="Requests are closed">
          {programme.organisation.name} isn&apos;t taking new card requests for this programme right now. Check back later, or contact them directly.
        </Callout>
      ) : !userId ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-h3 text-ink">Sign in to request your card</h2>
          <p className="text-body-ui text-ink-secondary">Your card is kept in your account&apos;s ID wallet, so you&apos;ll need to sign in or create a free account first.</p>
          <Button asChild variant="primary" className="self-start"><Link href={`/login?callbackUrl=${encodeURIComponent(here)}`}>Sign in to continue</Link></Button>
        </section>
      ) : (
        <JoinIdProgrammeForm
          organisationSlug={orgSlug}
          programmeSlug={programmeSlug}
          organisationName={programme.organisation.name}
          requiresApproval={programme.requiresApproval}
          defaultName={user?.name ?? ""}
          email={email ?? ""}
          fields={programme.fields}
        />
      )}
    </div>
  );
}
