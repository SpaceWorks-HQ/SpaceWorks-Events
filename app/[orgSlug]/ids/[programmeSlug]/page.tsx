import { loadRouteMetadata } from "@/lib/views/app__orgSlug__ids__programmeSlug__page";
import { loadJoinIdProgrammeView } from "@/lib/views/app__orgSlug__ids__programmeSlug__page";
import type { Metadata } from "next";
import Link from "next/link";
import { JoinIdProgrammeForm } from "@/components/member-ids/JoinIdProgrammeForm";
import { MemberStatusPill } from "@/components/member-ids/StatusPill";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { cardState } from "@/lib/memberIds/core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orgSlug: string; programmeSlug: string; }>; };

export async function generateMetadata({ params }: Props): Promise<Metadata> { return loadRouteMetadata({ params }); }

export default async function JoinIdProgrammePage({ params }: Props) {
  const { programme, existing, open, userId, here, orgSlug, programmeSlug, user, email } = await loadJoinIdProgrammeView({ params });
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
