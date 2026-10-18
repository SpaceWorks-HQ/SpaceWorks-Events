import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { FeaturesPage } from "@/components/landing/features/FeaturesPage";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything you need to run a free event: event pages, registration, check-in, programme, series, feedback and certificates, teams, privacy and a developer API.",
};

export default async function Page() {
  const session = await auth();
  const getStartedHref = session?.user ? "/dashboard" : "/login";
  return <FeaturesPage getStartedHref={getStartedHref} />;
}
