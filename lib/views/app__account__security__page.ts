import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { isSuperAdminEmail } from "@/lib/superAdminEmail";
import { isStaff, isStaffMfaRequired } from "@/lib/staffMfa";
import { SECURITY_ACTIVITY_ACTIONS, SECURITY_ACTIVITY_LIMIT } from "@/lib/accountSecurity";

export async function loadAccountSecurityView() {
  const session = await requireAuth();
  const userId = session.user.id;
  const [user, accounts, activity] = await Promise.all([
    // passwordHash is read only to derive a boolean; it never reaches the browser.
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true, passwordHash: true, email: true } }),
    prisma.account.findMany({ where: { userId }, select: { provider: true }, orderBy: { provider: "asc" } }),
    // The person's own security events only; metadata is never selected.
    prisma.auditEvent.findMany({
      where: { actorUserId: userId, action: { in: SECURITY_ACTIVITY_ACTIONS } },
      select: { id: true, action: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: SECURITY_ACTIVITY_LIMIT,
    }),
  ]);
  const hasPassword = Boolean(user.passwordHash);
  const providers = [...new Set(accounts.map((account) => account.provider))];
  // The super admin's password is set on the server, not here.
  const passwordOnServer = isSuperAdminEmail(user.email);
  // Organisation staff must set up an authenticator before using any dashboard.
  const authenticatorRequired = !user.mfaEnabledAt && isStaffMfaRequired() && !passwordOnServer && (await isStaff(userId));
  return { hasPassword, passwordOnServer, authenticatorRequired, user: { mfaEnabledAt: user.mfaEnabledAt }, providers, activity };
}
