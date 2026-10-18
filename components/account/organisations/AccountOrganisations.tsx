import Link from "next/link";
import { ArrowRight, Mail, Plus } from "lucide-react";
import type { MembershipRole } from "@prisma/client";
import { AccountCard } from "@/components/account/AccountCard";
import { ROLE_LABELS } from "@/components/members/memberSummary";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, OrgLogo } from "@/components/ui/display";
import { LeaveOrganisationButton } from "./LeaveOrganisationButton";
import type { AccountCollaborationRow, AccountInviteRow, AccountMembershipRow, AccountOrganisationsData } from "./data";

const ROLE_TONES = { OWNER: "ink", ADMIN: "warning", MEMBER: "neutral" } as const satisfies Record<MembershipRole, string>;

const rowClasses = "flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between";

export function AccountOrganisations({ data }: { data: AccountOrganisationsData }) {
  return (
    <div className="flex flex-col gap-6">
      <MembershipsCard memberships={data.memberships} />
      <CollaborationsCard collaborations={data.collaborations} />
      <InvitesCard invites={data.invites} />
    </div>
  );
}

function MembershipsCard({ memberships }: { memberships: AccountMembershipRow[] }) {
  const create = (
    <Button asChild size="sm" variant="secondary">
      <Link href="/dashboard/org/new">
        <Plus aria-hidden className="size-4" />
        Create organisation
      </Link>
    </Button>
  );
  return (
    <AccountCard
      id="account-orgs"
      title="Your organisations"
      description="Organisations you belong to and your role in each."
      action={memberships.length ? create : undefined}
    >
      {memberships.length === 0 ? (
        <EmptyState title="You're not in any organisations yet" action={create}>
          Create one to start running events, or ask an organisation owner for an invite link.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {memberships.map((membership) => (
            <li key={membership.id} className={rowClasses}>
              <div className="flex min-w-0 items-center gap-3">
                <OrgLogo name={membership.organisation.name} src={membership.organisation.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate text-label text-ink">{membership.organisation.name}</p>
                  <p className="truncate text-caption text-ink-muted">
                    /{membership.organisation.slug} · Joined {membership.joinedLabel}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Chip size="sm" tone={ROLE_TONES[membership.role]}>{ROLE_LABELS[membership.role]}</Chip>
                    <Chip size="sm">{membership.upcoming} upcoming {membership.upcoming === 1 ? "event" : "events"}</Chip>
                  </div>
                  {membership.soleOwner ? (
                    <p className="mt-1.5 text-caption text-ink-muted">You&rsquo;re the only owner, so you can&rsquo;t leave yet.</p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[52px] sm:pl-0">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/dashboard/${membership.organisation.slug}`}>
                    Open dashboard
                    <span className="sr-only"> for {membership.organisation.name}</span>
                  </Link>
                </Button>
                <LeaveOrganisationButton
                  organisationSlug={membership.organisation.slug}
                  organisationName={membership.organisation.name}
                  soleOwner={membership.soleOwner}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountCard>
  );
}

function PermissionChips({ permissions }: { permissions: string[] }) {
  if (permissions.length === 0) return <Chip size="sm">View only</Chip>;
  return (
    <>
      {permissions.map((label) => (
        <Chip key={label} size="sm">{label}</Chip>
      ))}
    </>
  );
}

function CollaborationsCard({ collaborations }: { collaborations: AccountCollaborationRow[] }) {
  return (
    <AccountCard
      id="account-collaborations"
      title="Event co-organiser roles"
      description="Events where an organisation has given you co-organiser permissions."
    >
      {collaborations.length === 0 ? (
        <p className="text-body-ui text-ink-muted">You aren&rsquo;t a co-organiser on any events.</p>
      ) : (
        <ul className="divide-y divide-line">
          {collaborations.map((row) => (
            <li key={row.id} className={rowClasses}>
              <div className="flex min-w-0 items-center gap-3">
                <OrgLogo name={row.organisation.name} src={row.organisation.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate text-label text-ink">{row.title}</p>
                  <p className="truncate text-caption text-ink-muted">
                    {row.organisation.name}
                    {row.kind === "series" ? " · Series" : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <PermissionChips permissions={row.permissions} />
                  </div>
                </div>
              </div>
              <div className="shrink-0 pl-[52px] sm:pl-0">
                <Button asChild size="sm" variant="secondary">
                  <Link href={row.href}>
                    Open event
                    <span className="sr-only"> {row.title}</span>
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountCard>
  );
}

function InvitesCard({ invites }: { invites: AccountInviteRow[] | null }) {
  return (
    <AccountCard
      id="account-invites"
      title="Pending invitations"
      description="Co-organiser invites sent to your email address."
    >
      {invites === null ? (
        <p className="text-body-ui text-ink-muted">Verify your email address to see invitations sent to it.</p>
      ) : invites.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No pending invitations.</p>
      ) : (
        <ul className="divide-y divide-line">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-subtle text-ink-muted">
                  <Mail className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-label text-ink">{invite.title}</p>
                  <p className="truncate text-caption text-ink-muted">
                    {invite.organisationName} · {invite.expiresLabel}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <PermissionChips permissions={invite.permissions} />
                  </div>
                  <p className="mt-1.5 text-caption text-ink-muted">Check your email for the invite link to accept.</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountCard>
  );
}
