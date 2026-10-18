import { loadView } from "@/lib/views/app__features__page";
import type { Metadata } from "next";
import { FeaturesPage } from "@/components/landing/features/FeaturesPage";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything you need to run a free maker event: event pages, short links, registration, live tickets and check-in, ID cards, programme, series, feedback and certificates, teams, privacy and a developer API.",
};

export default async function Page() {
  const { getStartedHref } = await loadView();
  return <FeaturesPage getStartedHref={getStartedHref} />;
}
