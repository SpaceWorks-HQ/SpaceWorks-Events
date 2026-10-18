import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AboutPage } from "@/components/landing/about/AboutPage";

export const metadata: Metadata = {
  title: "About",
  description: "Most event tools are built to sell tickets. Yuyu is built for free events run by communities: the meetup, the campus club, the NGO workshop.",
};

export default async function Page() {
  const session = await auth();
  return <AboutPage getStartedHref={session?.user ? "/dashboard" : "/login"} />;
}
