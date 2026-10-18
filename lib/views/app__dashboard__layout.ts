import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAppShellData } from "@/lib/appShell";
import { isSidebarCollapsed } from "@/lib/sidebarServer";

export async function loadDashboardShell() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [{ user, organisations }, collapsed] = await Promise.all([getAppShellData(session.user.id), isSidebarCollapsed()]);
  return { user, organisations, collapsed };
}
