import { loadRouteMetadata } from "@/lib/views/app__orgSlug__page";
import { loadOrganisationView } from "@/lib/views/app__orgSlug__page";
import Link from "next/link";
import { OrgEventsContainer } from "@/components/org/OrgEventsContainer";
import { CopyOrganisationUrl } from "@/components/org/CopyOrganisationUrl";
import { Button } from "@/components/ui/button";
import { Callout, Chip, EmptyState, OrgLogo } from "@/components/ui/display";

import type { Metadata } from "next";

type Props = { params: Promise<{ orgSlug: string; }>; };
const PUBLIC_COLLECTION_LIMIT = 250;



export async function generateMetadata({ params }: Props): Promise<Metadata> { return loadRouteMetadata({ params }); }

export default async function OrganisationPage({ params }: Props) {
  const { org, membership, upcomingCount, merged, collectionTruncated, now, goingCounts } = await loadOrganisationView({ params });
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        <OrgLogo name={org.name} src={org.logoUrl} size="xl" className="size-20 rounded-[16px] text-2xl sm:size-28 sm:rounded-[16px] sm:text-4xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-display-m min-w-0 break-words text-ink">{org.name}</h1>
            {membership ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/${org.slug}`}>Dashboard</Link>
              </Button>
            ) : null}
          </div>
          <p className="max-w-[640px] text-body-l text-ink-secondary">
            {org.description || "Community, events, and updates—check back soon for what’s next."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {upcomingCount > 0 ? <Chip className="bg-sw-citron text-sw-ink">{upcomingCount} upcoming</Chip> : null}
            {merged.length > 0 ? <Chip>{merged.length} {merged.length === 1 ? "event" : "events"} hosted</Chip> : null}
            <CopyOrganisationUrl slug={org.slug} />
          </div>
        </div>
      </header>

      <section id="events-list" aria-label="Events" className="flex flex-col gap-4">
        {collectionTruncated ? <Callout tone="info">Showing the first {PUBLIC_COLLECTION_LIMIT} standalone events and recurring dates in the public three-year window. Use event links or the organiser dashboard for older records.</Callout> : null}
        {merged.length === 0 ? (
          <EmptyState
            title="No events scheduled yet"
            action={membership ? <Button asChild variant="primary"><Link href={`/dashboard/${org.slug}`}>Create your first event</Link></Button> : undefined}
          >
            This community hasn&apos;t published any events or recurring series yet. Check back soon!
          </EmptyState>
        ) : (
          <OrgEventsContainer
            orgSlug={org.slug}
            organisationName={org.name}
            initialNow={now.toISOString()}
            items={merged}
            goingCounts={goingCounts}
          />
        )}
      </section>
    </div>
  );
}
