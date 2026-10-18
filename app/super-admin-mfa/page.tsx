import { loadSuperAdminMfaView } from "@/lib/views/app__super-admin-mfa__page";
import type { Metadata } from "next";
import { SuperAdminMfaPrompt } from "@/components/super-admin/SuperAdminMfaPrompt";

export const metadata: Metadata = { title: "Verify super-admin access" };

export default async function SuperAdminMfaPage() {
  const { } = await loadSuperAdminMfaView();
  return <SuperAdminMfaPrompt />;
}
