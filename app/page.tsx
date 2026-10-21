import { loadView } from "@/lib/views/app__page";
import { HomePage } from "@/components/landing/HomePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Space Works Events — Less admin. More making." },
  description:
    "Space Works Events gives makerspaces, workshops and community groups everything to run their events, free or ticketed: event pages, registrations and waitlists, tickets paid straight to your own Razorpay or Stripe account, live tickets, check-in, ID cards, short links, feedback and certificates.",
};

export default async function Page() {
  const { getStartedHref } = await loadView();
  return <HomePage getStartedHref={getStartedHref} />;
}
