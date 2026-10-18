import "server-only";

import type { Prisma } from "@prisma/client";
import { computeExpiry, formatIdNumber } from "./core";

/*
 * Issuing cards. Approval gives a member an ID number (once; it is kept if
 * the card is later revoked and reinstated), an issue date and an expiry from
 * the programme's rule. Sequence numbers come from an atomic increment on the
 * programme row inside the caller's transaction, so concurrent approvals never
 * share a number; the unique (programme, idNumber) index is the final guard.
 */

type Programme = { id: string; idPrefix: string; validUntil: Date | null; validityDays: number | null };

export async function approveMembers(tx: Prisma.TransactionClient, programme: Programme, memberIds: string[], now = new Date()) {
  if (memberIds.length === 0) return 0;
  const members = await tx.idMember.findMany({
    where: { id: { in: memberIds }, programmeId: programme.id, status: { in: ["PENDING", "REJECTED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, idNumber: true },
  });
  if (members.length === 0) return 0;
  const needNumbers = members.filter((member) => !member.idNumber).length;
  let sequence = 0;
  if (needNumbers > 0) {
    const updated = await tx.idProgramme.update({ where: { id: programme.id }, data: { nextSequence: { increment: needNumbers } }, select: { nextSequence: true } });
    sequence = updated.nextSequence - needNumbers;
  }
  const year = now.getUTCFullYear();
  const expiresAt = computeExpiry(programme, now);
  for (const member of members) {
    const idNumber = member.idNumber ?? formatIdNumber(programme.idPrefix, year, sequence++);
    await tx.idMember.update({
      where: { id: member.id },
      data: { status: "APPROVED", idNumber, issuedAt: now, expiresAt, revokedAt: null, statusReason: null },
    });
  }
  return members.length;
}
