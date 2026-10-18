import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { AccountSecurityClient } from "@/components/security/AccountSecurityClient";
import { AccountPasswordForm } from "@/components/account/AccountPasswordForm";
import { SignInMethodsCard } from "@/components/security/SignInMethodsCard";
import { SecurityActivityCard } from "@/components/security/SecurityActivityCard";
import { SignOutEverywhereCard } from "@/components/security/SignOutEverywhereCard";
import { SECURITY_ACTIVITY_ACTIONS, SECURITY_ACTIVITY_LIMIT, securityActivityLabel } from "@/lib/accountSecurity";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const session = await requireAuth();
  const userId = session.user.id;
  const [user, accounts, activity] = await Promise.all([
    // passwordHash is read only to derive a boolean; it never reaches the browser.
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true, passwordHash: true } }),
    prisma.account.findMany({ where: { userId }, select: { provider: true }, orderBy: { provider: "asc" } }),
    // The person's own security events only; metadata is never selected.
    prisma.auditEvent.findMany({
      where: { actorUserId: userId, action: { in: SECURITY_ACTIVITY_ACTIONS } },
      select: { id: true, action: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: SECURITY_ACTIVITY_LIMIT,
    }),
  ]);
  const hasPassword = Boolean(user.passwordHash);
  const providers = [...new Set(accounts.map((account) => account.provider))];

  return (
    <div className="flex flex-col gap-6">
      <AccountPasswordForm hasPassword={hasPassword} />
      <AccountSecurityClient mfaEnabled={Boolean(user.mfaEnabledAt)} />
      <SignInMethodsCard hasPassword={hasPassword} providers={providers} />
      <SecurityActivityCard
        items={activity.map((event) => ({ id: event.id, label: securityActivityLabel(event.action), at: event.createdAt.toISOString() }))}
      />
      <SignOutEverywhereCard />
    </div>
  );
}
