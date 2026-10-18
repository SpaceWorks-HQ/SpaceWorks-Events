import { loadView } from "@/lib/views/app__about__page";
import type { Metadata } from "next";
import { AboutPage } from "@/components/landing/about/AboutPage";

export const metadata: Metadata = {
  title: "About",
  description: "Space Works Events is the open-source event platform from Space Works, built for free events run by maker communities: the build night, the workshop, the meetup.",
};

export default async function Page() {
  const { session } = await loadView();
  return <AboutPage getStartedHref={session?.user ? "/dashboard" : "/login"} />;
}
