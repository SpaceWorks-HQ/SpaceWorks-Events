import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function loadSuperAdminShell() {
  const session = await requireSuperAdminMfa();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true, profileImageUrl: true },
  });
  return { user };
}
