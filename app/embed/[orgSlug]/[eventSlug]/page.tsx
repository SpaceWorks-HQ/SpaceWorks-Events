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
      {/* The same gutter as the organiser pages, which this route renders without their chrome. */}
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1160px] px-4 py-6 focus:outline-none sm:px-6 sm:py-8">
        <EventPage params={params} />
      </main>
      <EmbedCredit />
    </>
  );
}
