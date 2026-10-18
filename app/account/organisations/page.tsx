import type { Metadata } from "next";
import { requireAuth } from "@/lib/permissions";
import { AccountOrganisations } from "@/components/account/organisations/AccountOrganisations";
import { loadAccountOrganisations } from "@/components/account/organisations/data";

export const metadata: Metadata = { title: "Your organisations" };

export default async function AccountOrganisationsPage() {
  const session = await requireAuth();
  const data = await loadAccountOrganisations(session.user.id);
  return <AccountOrganisations data={data} />;
}
