import { prisma } from "@/lib/db";
import { walletSelect, walletWhere } from "@/lib/memberIds/access";
import { publicOrigin } from "@/lib/memberIds/data";
import { requireAuth } from "@/lib/permissions";
export async function loadAccountIdsView() {

  const session = await requireAuth();
  const members = await prisma.idMember.findMany({
    where: await walletWhere(session.user.id),
    select: walletSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const origin = publicOrigin();


  return { members, origin };
}
