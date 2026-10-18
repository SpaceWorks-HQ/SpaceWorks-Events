import "server-only";

import { prisma } from "@/lib/db";
import { memberPhotoUrl, VERIFY_TOKEN_PATTERN } from "./data";
import { verificationView, type VerifyView } from "./verify";

/** Look a verify token up and reduce it to what the public page may show. */
export async function lookupVerification(token: string, now = new Date()): Promise<VerifyView> {
  if (!VERIFY_TOKEN_PATTERN.test(token)) return { state: "not-found" };
  const member = await prisma.idMember.findUnique({
    where: { verifyToken: token },
    select: {
      status: true,
      name: true,
      idNumber: true,
      expiresAt: true,
      photoUrl: true,
      organisationId: true,
      programme: { select: { name: true, organisation: { select: { name: true } } } },
    },
  });
  if (!member) return { state: "not-found" };
  return verificationView({
    status: member.status,
    name: member.name,
    idNumber: member.idNumber,
    expiresAt: member.expiresAt,
    photoUrl: memberPhotoUrl(member),
    programmeName: member.programme.name,
    organisationName: member.programme.organisation.name,
  }, now);
}
