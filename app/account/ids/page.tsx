import { loadAccountIdsView } from "@/lib/views/app__account__ids__page";
import type { Metadata } from "next";
import Link from "next/link";
import { MemberStatusPill } from "@/components/member-ids/StatusPill";
import { WalletCard } from "@/components/member-ids/WalletCard";
import { EmptyState } from "@/components/ui/display";
import { cardState } from "@/lib/memberIds/core";
import { memberCardPerson, programmeBranding, programmeDesign } from "@/lib/memberIds/presentation";
import { sideSettings } from "@/lib/memberIds/design";

export const metadata: Metadata = { title: "Your IDs", description: "ID cards issued to you." };
export const dynamic = "force-dynamic";

/** The signed-in person's ID cards: their own requests, and cards issued to their verified email. */
export default async function AccountIdsPage() {
  const { members, origin } = await loadAccountIdsView();
  if (members.length === 0) {
    return (
      <EmptyState title="No ID cards yet">
        When an organisation issues you a card, it appears here. Ask them for their ID card link, or check the email address on your account is verified.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-h2 text-ink">Your IDs</h2>
        <p className="text-body-ui text-ink-secondary">Tilt a card to catch the light, flip it to see the back, or download it to print.</p>
      </div>
      <ul className="grid gap-6 lg:grid-cols-2">
        {members.map((member) => {
          const { programme } = member;
          const state = cardState(member);
          const design = programmeDesign(programme, programme.organisation.name);
          const issued = member.status === "APPROVED";
          return (
            <li key={member.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-h3 text-ink">{programme.name}</h3>
                  <p className="text-body-ui text-ink-secondary">{programme.organisation.name}</p>
                </div>
                <MemberStatusPill state={state} />
              </div>
              {issued ? (
                <WalletCard
                  memberId={member.id}
                  front={sideSettings(design, "front", programme.fields)}
                  back={design.backEnabled ? sideSettings(design, "back", programme.fields) : null}
                  person={memberCardPerson(member, programme.fields, origin)}
                  branding={programmeBranding(programme, programme.organisation.logoUrl)}
                  label={`${programme.name} card for ${member.name}`}
                  verifyPath={`/verify/${member.verifyToken}`}
                />
              ) : (
                <p className="text-body-ui text-ink-secondary">
                  {member.status === "PENDING"
                    ? `${programme.organisation.name} hasn't approved this card yet.`
                    : member.status === "REVOKED"
                      ? `${programme.organisation.name} has withdrawn this card.`
                      : `${programme.organisation.name} didn't approve this request.`}{" "}
                  <Link href={`/${programme.organisation.slug}/ids/${programme.slug}`} className="font-semibold text-primary underline-offset-4 hover:underline">See the programme</Link>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
