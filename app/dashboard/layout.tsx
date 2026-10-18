import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAppShellData } from "@/lib/appShell";
import { AppShell } from "@/components/chrome/AppShell";
import { isSidebarCollapsed } from "@/lib/sidebarServer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [{ user, organisations }, collapsed] = await Promise.all([getAppShellData(session.user.id), isSidebarCollapsed()]);
  return (
    <AppShell user={user} organisations={organisations} initialCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
