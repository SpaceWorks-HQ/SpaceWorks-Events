import { loadVerifyMfaView } from "@/lib/views/app__verify-mfa__page";
import type { Metadata } from "next";
import { MfaStepUpPrompt } from "@/components/security/MfaStepUpPrompt";

export const metadata: Metadata = { title: "Confirm it's you", robots: { index: false, follow: false } };

export default async function VerifyMfaPage({ searchParams }: { searchParams: Promise<{ next?: string; }>; }) {
  const { next } = await loadVerifyMfaView({ searchParams });
  return <MfaStepUpPrompt next={next} />;
}
