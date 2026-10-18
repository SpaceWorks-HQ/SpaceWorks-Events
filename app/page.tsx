import { auth } from "@/lib/auth";
import { HomePage } from "@/components/landing/HomePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Yuyu — Host events people show up to",
  description:
    "Yuyu gives clubs, meetups and community groups everything to run free events: a beautiful event page, registrations and waitlists, tickets, check-in at the door and feedback afterwards.",
};

export default async function Page() {
  const session = await auth();
  const getStartedHref = session?.user ? "/dashboard" : "/login";

  return <HomePage getStartedHref={getStartedHref} />;
}
