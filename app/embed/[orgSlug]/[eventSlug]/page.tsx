import type { Metadata } from "next";
import EventPage from "@/app/[orgSlug]/[eventSlug]/page";
import { EmbedCredit } from "@/components/chrome/SiteFooter";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string }> };

export const metadata: Metadata = {
  title: "Embedded event",
  robots: { index: false, follow: false },
};

/**
 * Public event content reused in a deliberately framable surface. Access is
 * still resolved by the canonical event page, so unpublished/private events
 * remain unavailable here as well.
 */
export default async function EmbeddedEventPage({ params }: Props) {
  return (
    <>
      <EventPage params={params} />
      <EmbedCredit />
    </>
  );
}
