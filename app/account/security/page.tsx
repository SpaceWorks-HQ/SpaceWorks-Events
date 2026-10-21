import { loadAccountSecurityView } from "@/lib/views/app__account__security__page";
import type { Metadata } from "next";
import { AccountSecurityClient } from "@/components/security/AccountSecurityClient";
import { AccountPasswordForm } from "@/components/account/AccountPasswordForm";
import { SignInMethodsCard } from "@/components/security/SignInMethodsCard";
import { SecurityActivityCard } from "@/components/security/SecurityActivityCard";
import { SignOutEverywhereCard } from "@/components/security/SignOutEverywhereCard";
import { securityActivityLabel } from "@/lib/accountSecurity";
import { Callout } from "@/components/ui/display";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const { hasPassword, passwordOnServer, user, providers, activity } = await loadAccountSecurityView();
  return (
    <div className="flex flex-col gap-6">
      {passwordOnServer
        ? <Callout tone="info" title="Password">The super admin&apos;s password is set on the server: run <code>sudo bash scripts/vps-recover.sh</code> on the VPS and open the link it prints.</Callout>
        : <AccountPasswordForm hasPassword={hasPassword} />}
      <AccountSecurityClient mfaEnabled={Boolean(user.mfaEnabledAt)} />
      <SignInMethodsCard hasPassword={hasPassword} providers={providers} />
      <SecurityActivityCard
        items={activity.map((event) => ({ id: event.id, label: securityActivityLabel(event.action), at: event.createdAt.toISOString() }))}
      />
      <SignOutEverywhereCard />
    </div>
  );
}
