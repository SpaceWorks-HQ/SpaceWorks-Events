import { auth } from "@/lib/auth";
import { HomePage } from "@/components/landing/HomePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Space Works Events — Less admin. More making." },
  description:
    "Space Works Events gives makerspaces, workshops and community groups everything to run free events: event pages, registrations and waitlists, live tickets, check-in, ID cards, short links, feedback and certificates.",
};

export default async function Page() {
  const session = await auth();
  const getStartedHref = session?.user ? "/dashboard" : "/login";

  return <HomePage getStartedHref={getStartedHref} />;
}
