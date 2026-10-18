import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { getAppShellData } from "@/lib/appShell";
import { isSidebarCollapsed } from "@/lib/sidebarServer";

export async function loadAccountShell() {
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
  return { user, organisations, collapsed, account };
}
