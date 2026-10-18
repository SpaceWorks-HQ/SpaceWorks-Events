import "server-only";

import type { Prisma } from "@prisma/client";
import { computeExpiry, formatIdNumber } from "./core";

/*
 * Issuing cards. Approval gives a member an ID number (once; it is kept if
 * the card is later revoked and reinstated), an issue date and an expiry from
 * the programme's rule. The programme row is locked first, so concurrent
 * approvals run one after the other: the second sees the members the first
 * already approved and leaves them (and their numbers) alone. Sequence numbers
 * come from an increment on that row; the unique (programme, idNumber) index
 * is the final guard. The work is set-based (a fixed number of statements
 * however many members), so large imports fit in one transaction.
 */

type Programme = { id: string; idPrefix: string; validUntil: Date | null; validityDays: number | null };

/** Approve the pending or rejected members among `memberIds`; returns how many changed. Numbers follow join order, then `memberIds` order. */
export async function approveMembers(tx: Prisma.TransactionClient, programme: Programme, memberIds: string[], now = new Date()) {
  if (memberIds.length === 0) return 0;
  await tx.$queryRaw`SELECT "id" FROM "IdProgramme" WHERE "id" = ${programme.id} FOR UPDATE`;
  const position = new Map(memberIds.map((id, index) => [id, index]));
  const members = (await tx.idMember.findMany({
    where: { id: { in: memberIds }, programmeId: programme.id, status: { in: ["PENDING", "REJECTED"] } },
    select: { id: true, idNumber: true, createdAt: true },
  })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || position.get(a.id)! - position.get(b.id)!);
  if (members.length === 0) return 0;

  const unnumbered = members.filter((member) => !member.idNumber);
  if (unnumbered.length > 0) {
    const updated = await tx.idProgramme.update({ where: { id: programme.id }, data: { nextSequence: { increment: unnumbered.length } }, select: { nextSequence: true } });
    const first = updated.nextSequence - unnumbered.length;
    const year = now.getUTCFullYear();
    const numbers = unnumbered.map((_, index) => formatIdNumber(programme.idPrefix, year, first + index));
    await tx.$executeRaw`
      UPDATE "IdMember" AS m SET "idNumber" = v."idNumber"
      FROM unnest(${unnumbered.map((member) => member.id)}::text[], ${numbers}::text[]) AS v("id", "idNumber")
      WHERE m."id" = v."id" AND m."idNumber" IS NULL`;
  }
  const { count } = await tx.idMember.updateMany({
    where: { id: { in: members.map((member) => member.id) }, status: { in: ["PENDING", "REJECTED"] } },
    data: { status: "APPROVED", issuedAt: now, expiresAt: computeExpiry(programme, now), revokedAt: null, statusReason: null },
  });
  return count;
}
