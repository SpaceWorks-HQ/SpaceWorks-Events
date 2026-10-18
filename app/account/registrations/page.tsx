import type { Metadata } from "next";
import { requireAuth } from "@/lib/permissions";
import { ACCOUNT_REGISTRATIONS_LIMIT, loadAccountRegistrations } from "@/lib/accountRegistrations";
import { AccountSection, CertificateList, RegistrationList } from "@/components/account/registrations/RegistrationSections";
import { DataExportCard } from "@/components/account/DataExportCard";

export const metadata: Metadata = {
  title: "Your registrations",
  robots: { index: false, follow: false },
  // Rows link to opaque ticket URLs; never leak them through Referer.
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function AccountRegistrationsPage() {
  // The page authenticates itself; the account layout is not an authorization boundary.
  const session = await requireAuth();
  const { upcoming, past, certificates } = await loadAccountRegistrations(session.user.id);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AccountSection id="upcoming" title="Upcoming" description="Events you've registered for that haven't ended yet, soonest first.">
        <RegistrationList
          rows={upcoming}
          past={false}
          limit={ACCOUNT_REGISTRATIONS_LIMIT}
          emptyTitle="Nothing coming up"
          emptyBody="When you register for an event, your ticket and the details will be here."
        />
      </AccountSection>

      <AccountSection id="past" title="Past" description="Events you registered for that have already ended, most recent first.">
        <RegistrationList
          rows={past}
          past
          limit={ACCOUNT_REGISTRATIONS_LIMIT}
          emptyTitle="No past events yet"
          emptyBody="Events you've attended or registered for will be kept here after they end."
        />
      </AccountSection>

      <AccountSection id="certificates" title="Certificates" description="Certificates of participation from events you gave feedback on.">
        <CertificateList rows={certificates} />
      </AccountSection>

      <DataExportCard />
    </div>
  );
}
