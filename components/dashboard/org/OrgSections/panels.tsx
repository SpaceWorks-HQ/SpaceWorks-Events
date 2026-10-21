import Link from "next/link";
import { Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { formatDayShort, formatTime } from "@/lib/format/datetime";
import type { OrgDashboard, OrgSeriesCard } from "@/lib/orgDashboard";

/* ---------- Series & team ---------- */

export function OrgSeriesPanel({ base, series, now, action }: { base: string; series: { cards: OrgSeriesCard[]; total: number }; now: Date; action: ReactNode }) {
  return (
    <section id="series" aria-labelledby="org-series-title" className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="org-series-title" className="text-h4 text-ink">Series</h2>
        {action}
      </div>
      {series.cards.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No recurring series yet. Create one to keep a regular event rhythm.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {series.cards.map((card) => (
            <li key={card.id}>
              <Link href={`${base}/series/${card.id}`} className="flex flex-col gap-1.5 rounded-lg bg-subtle p-3.5 transition-colors hover:bg-emphasis">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip size="sm" icon={<Repeat />}>{card.rule}</Chip>
                  {card.isDraft ? <Chip size="sm" tone="warning">Draft</Chip> : null}
                </span>
                <span className="font-bold text-ink">{card.title}</span>
                <span className="text-caption text-ink-muted">
                  {card.next ? `Next: ${formatDayShort(card.next.start, card.next.timezone, now)} · ${formatTime(card.next.start, card.next.timezone)} · ${card.next.going} going` : "No upcoming dates"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {series.total > series.cards.length ? <p className="text-caption text-ink-muted">Showing {series.cards.length} of {series.total} series.</p> : null}
    </section>
  );
}

export function OrgTeamPanel({ members, membersHref, canInvite }: { members: OrgDashboard["members"]; membersHref: string; canInvite: boolean }) {
  const parts = [
    members.owners ? `${members.owners} ${members.owners === 1 ? "owner" : "owners"}` : null,
    members.admins ? `${members.admins} ${members.admins === 1 ? "admin" : "admins"}` : null,
    members.members ? `${members.members} ${members.members === 1 ? "member" : "members"}` : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="org-team-title" className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="org-team-title" className="text-h4 text-ink">Team</h2>
        <Link href={membersHref} className="text-sm font-semibold text-ink underline-offset-4 hover:underline">Members</Link>
      </div>
      <span aria-hidden className="flex">
        {members.initials.map((initials, index) => (
          <span key={index} className={cn("-ml-1.5 inline-flex size-9 items-center justify-center rounded-full border-2 border-canvas text-xs font-bold first:ml-0", index === 0 ? "bg-primary text-on-primary" : "bg-muted text-ink-secondary")}>
            {initials}
          </span>
        ))}
      </span>
      <p className="text-body-ui text-ink-secondary">{parts.join(" · ")}</p>
      {canInvite ? (
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={membersHref}>Invite people</Link>
        </Button>
      ) : null}
    </section>
  );
}
