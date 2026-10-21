import { prisma } from "@/lib/db";
import { getEmailSettings } from "@/lib/instanceSettings";
import { senderAddress } from "@/lib/email/transporter";
import { requireOrgRole } from "@/lib/permissions";
import type { OrganisationEmailStatus } from "@/components/settings/OrganisationEmailForm";

/** Owner only. "Is set" for the password, never the value or its ciphertext. */
export async function loadOrganisationEmailView({ params }: { params: Promise<{ orgSlug: string; }>; }) {
  const { orgSlug } = await params;
  const { organisation } = await requireOrgRole(orgSlug, "OWNER");
  const [row, platform] = await Promise.all([
    prisma.organisationEmailSettings.findUnique({ where: { organisationId: organisation.id } }),
    getEmailSettings().catch(() => null),
  ]);
  const status: OrganisationEmailStatus = {
    fromName: row?.fromName ?? "",
    replyTo: row?.replyTo ?? "",
    useOwnServer: row?.useOwnServer ?? false,
    fromAddress: row?.fromAddress ?? "",
    smtpHost: row?.smtpHost ?? "",
    smtpPort: row?.smtpPort ?? null,
    smtpSecure: row?.smtpSecure ?? false,
    smtpUser: row?.smtpUser ?? "",
    hasPassword: Boolean(row?.smtpPasswordEncrypted),
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
  };
  return { organisation: { slug: organisation.slug, name: organisation.name }, status, platformAddress: platform?.from ? senderAddress(platform.from) : null };
}
