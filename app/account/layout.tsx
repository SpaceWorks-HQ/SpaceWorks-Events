import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { getAppShellData } from "@/lib/appShell";
import { AppShell } from "@/components/chrome/AppShell";
import { isSidebarCollapsed } from "@/lib/sidebarServer";
import { AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";
import { formatMemberSince } from "@/lib/accountSecurity";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const [{ user, organisations }, collapsed, account] = await Promise.all([
    getAppShellData(session.user.id),
    isSidebarCollapsed(),
    // Header facts only: booleans and a date, never secrets.
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { emailVerified: true, mfaEnabledAt: true, createdAt: true },
    }),
  ]);
  return (
    <AppShell user={user} organisations={organisations} initialCollapsed={collapsed}>
      <AccountSettingsLayout
        account={{
          name: user.name,
          email: user.email,
          image: user.image,
          emailVerified: Boolean(account.emailVerified),
          mfaEnabled: Boolean(account.mfaEnabledAt),
          memberSinceLabel: formatMemberSince(account.createdAt),
        }}
      >
        {children}
      </AccountSettingsLayout>
    </AppShell>
  );
}
