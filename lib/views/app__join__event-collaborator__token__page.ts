import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashEventCollaboratorToken } from "@/lib/eventCollaboratorToken";
export async function loadJoinEventCollaboratorView({ params }: { params: Promise<{ token: string; }>; }) {

  const { token } = await params;
  const session = await auth();
  const url = `/join/event-collaborator/${encodeURIComponent(token)}`;
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(url)}`);
  let invite = await prisma.eventCollaboratorInvite.findUnique({
    where: { tokenHash: hashEventCollaboratorToken(token) },
    select: { email: true, usedAt: true, expiresAt: true, event: { select: { title: true } }, series: { select: { title: true } } },
  });

  if (invite && (invite.usedAt || invite.expiresAt <= new Date() || !session.user.email || session.user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase())) invite = null;

  return { token, session, invite };
}
