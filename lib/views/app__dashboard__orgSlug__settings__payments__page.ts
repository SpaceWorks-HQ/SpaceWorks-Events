import { prisma } from "@/lib/db";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { requireOrgRole } from "@/lib/permissions";
import { paymentSettingsStatus, webhookUrl } from "@/lib/payments/settings";

/** Owner only. Returns "is set" flags, never secret values or ciphertext. */
export async function loadPaymentSettingsView({ params }: { params: Promise<{ orgSlug: string; }>; }) {
  const { orgSlug } = await params;
  const { organisation } = await requireOrgRole(orgSlug, "OWNER");
  const [row, paidEventsEnabled] = await Promise.all([
    prisma.organisationPaymentSettings.findUnique({ where: { organisationId: organisation.id } }),
    isPaidEventsEnabled(),
  ]);
  const status = paymentSettingsStatus(row);
  const webhookUrls = row
    ? { razorpay: await webhookUrl("RAZORPAY", row.webhookPathId), stripe: await webhookUrl("STRIPE", row.webhookPathId) }
    : null;
  return { organisation, status: { ...status, webhookPathId: null }, webhookUrls, paidEventsEnabled };
}
