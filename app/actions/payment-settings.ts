"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { getMembership } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { PaymentsUnavailable } from "@/lib/payments/http";
import { isValidCurrency } from "@/lib/payments/money";
import { isStripeTestKey } from "@/lib/payments/providers/stripe";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { configuredProvider, gatewayFor, hasCompleteCredentials, isProviderTestMode, newWebhookPathId } from "@/lib/payments/settings";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const orgSlug = z.string().trim().min(1).max(120);
const provider = z.enum(["RAZORPAY", "STRIPE"]);
/** Blank means "keep the stored value": secrets are write-only. */
const optionalSecret = (pattern: RegExp) => z.string().trim().max(512).optional().transform((value) => value || undefined)
  .refine((value) => value === undefined || pattern.test(value), { message: "invalid" });

const saveSchema = z.object({
  organisationSlug: orgSlug,
  provider: provider.nullable(),
  currency: z.string().trim().toUpperCase().refine(isValidCurrency, { message: "Choose a valid currency." }),
  razorpayKeyId: z.string().trim().max(80).optional().transform((value) => value || undefined)
    .refine((value) => value === undefined || /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(value), { message: "Enter a Razorpay key id that starts with rzp_test_ or rzp_live_." }),
  razorpayKeySecret: optionalSecret(/^[A-Za-z0-9]{8,128}$/),
  razorpayWebhookSecret: optionalSecret(/^\S{8,256}$/),
  stripeSecretKey: optionalSecret(/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,250}$/),
  stripeWebhookSecret: optionalSecret(/^whsec_[A-Za-z0-9+/=_-]{10,250}$/),
}).strict();
const providerSchema = z.object({ organisationSlug: orgSlug, provider }).strict();

type OwnerAccess = { error: string; } | { userId: string; organisation: { id: string; slug: string; }; };

/** Payment settings are the owner's alone, after a fresh sign-in for any change. */
async function requireOwner(organisationSlug: string, options: { recentSignIn: boolean; }): Promise<OwnerAccess> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };
  const organisation = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true } });
  if (!organisation) return { error: "Organisation not found." };
  const membership = await getMembership(session.user.id, organisation.id);
  if (membership?.role !== "OWNER") return { error: "Only the organisation owner can manage payments." };
  if (options.recentSignIn && !(await hasRecentAuthentication())) return { error: "For security, sign in again before changing payment settings." };
  if (await isActionRateLimited("paymentSettings", session.user.id)) return { error: "Too many payment settings changes. Try again later." };
  return { userId: session.user.id, organisation };
}

const SECRET_MESSAGES: Record<string, string> = {
  razorpayKeySecret: "Enter the Razorpay key secret exactly as Razorpay shows it.",
  razorpayWebhookSecret: "Enter the Razorpay webhook secret you set in the Razorpay dashboard (at least 8 characters).",
  stripeSecretKey: "Enter a Stripe secret key that starts with sk_test_, sk_live_, rk_test_ or rk_live_.",
  stripeWebhookSecret: "Enter the Stripe signing secret that starts with whsec_.",
};

export async function savePaymentSettings(input: unknown): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    return { ok: false, error: SECRET_MESSAGES[field] ?? issue?.message ?? "Check the payment settings." };
  }
  const access = await requireOwner(parsed.data.organisationSlug, { recentSignIn: true });
  if ("error" in access) return { ok: false, error: access.error };
  const { razorpayKeySecret, razorpayWebhookSecret, stripeSecretKey, stripeWebhookSecret, ...value } = parsed.data;
  const organisationId = access.organisation.id;

  const existing = await prisma.organisationPaymentSettings.findUnique({ where: { organisationId } });
  const razorpayKeyId = value.razorpayKeyId ?? existing?.razorpayKeyId ?? null;
  const update = {
    provider: value.provider,
    currency: value.currency,
    razorpayKeyId,
    ...(razorpayKeySecret ? { razorpayKeySecretEncrypted: encryptPaymentSecret(organisationId, "razorpayKeySecretEncrypted", razorpayKeySecret) } : {}),
    ...(razorpayWebhookSecret ? { razorpayWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "razorpayWebhookSecretEncrypted", razorpayWebhookSecret) } : {}),
    ...(stripeSecretKey ? { stripeSecretKeyEncrypted: encryptPaymentSecret(organisationId, "stripeSecretKeyEncrypted", stripeSecretKey), stripeTestMode: isStripeTestKey(stripeSecretKey) } : {}),
    ...(stripeWebhookSecret ? { stripeWebhookSecretEncrypted: encryptPaymentSecret(organisationId, "stripeWebhookSecretEncrypted", stripeWebhookSecret) } : {}),
  };
  const credentialsChanged = Boolean(razorpayKeySecret || stripeSecretKey || (value.razorpayKeyId && value.razorpayKeyId !== existing?.razorpayKeyId));
  const next = { ...existing, organisationId, ...update } as Parameters<typeof hasCompleteCredentials>[0];
  if (value.provider && !hasCompleteCredentials(next, value.provider)) {
    return { ok: false, error: value.provider === "RAZORPAY"
      ? "Enter the Razorpay key id, key secret and webhook secret before choosing Razorpay."
      : "Enter the Stripe secret key and signing secret before choosing Stripe." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.organisationPaymentSettings.upsert({
      where: { organisationId },
      create: { organisationId, webhookPathId: newWebhookPathId(), ...update },
      // "Verified" describes the selected provider's current keys only.
      update: { ...update, ...(credentialsChanged || value.provider !== existing?.provider ? { verifiedAt: null } : {}) },
    });
    await recordAuditEvent({
      action: "PAYMENT_SETTINGS_UPDATED",
      actorUserId: access.userId,
      organisationId,
      targetType: "Organisation",
      targetId: organisationId,
      metadata: {
        razorpaySelected: value.provider === "RAZORPAY",
        stripeSelected: value.provider === "STRIPE",
        configured: configuredProvider({ ...next, provider: value.provider }) !== null,
        credentialsChanged,
        webhookSecretChanged: Boolean(razorpayWebhookSecret || stripeWebhookSecret),
      },
      client: tx,
    });
  });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/payments`);
  revalidatePath(`/dashboard/${access.organisation.slug}/settings`);
  return { ok: true };
}

/** Removes one provider's keys. A provider that is in use is also deselected. */
export async function disconnectPaymentProvider(input: unknown): Promise<ActionResult> {
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a provider to disconnect." };
  const access = await requireOwner(parsed.data.organisationSlug, { recentSignIn: true });
  if ("error" in access) return { ok: false, error: access.error };
  const organisationId = access.organisation.id;
  const existing = await prisma.organisationPaymentSettings.findUnique({ where: { organisationId }, select: { provider: true } });
  if (!existing) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.organisationPaymentSettings.update({
      where: { organisationId },
      data: {
        ...(parsed.data.provider === "RAZORPAY"
          ? { razorpayKeyId: null, razorpayKeySecretEncrypted: null, razorpayWebhookSecretEncrypted: null }
          : { stripeSecretKeyEncrypted: null, stripeWebhookSecretEncrypted: null, stripeTestMode: false }),
        ...(existing.provider === parsed.data.provider ? { provider: null, verifiedAt: null } : {}),
      },
    });
    await recordAuditEvent({
      action: "PAYMENT_PROVIDER_DISCONNECTED",
      actorUserId: access.userId,
      organisationId,
      targetType: "Organisation",
      targetId: organisationId,
      metadata: { razorpay: parsed.data.provider === "RAZORPAY", stripe: parsed.data.provider === "STRIPE" },
      client: tx,
    });
  });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/payments`);
  revalidatePath(`/dashboard/${access.organisation.slug}/settings`);
  return { ok: true };
}

/** Makes one cheap authenticated call with the stored keys. Never echoes the provider's reply. */
export async function testPaymentConnection(input: unknown): Promise<ActionResult<{ testMode: boolean; }>> {
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a provider to test." };
  const access = await requireOwner(parsed.data.organisationSlug, { recentSignIn: false });
  if ("error" in access) return { ok: false, error: access.error };
  const organisationId = access.organisation.id;
  const row = await prisma.organisationPaymentSettings.findUnique({ where: { organisationId } });
  const gateway = row ? gatewayFor(row, parsed.data.provider) : null;
  if (!row || !gateway) return { ok: false, error: "Save the provider's keys first." };
  try {
    await gateway.testConnection();
  } catch (error) {
    const rejected = error instanceof PaymentsUnavailable && (error.status === 401 || error.status === 403);
    await recordAuditEvent({ action: "PAYMENT_CONNECTION_TESTED", actorUserId: access.userId, organisationId, targetType: "Organisation", targetId: organisationId, metadata: { succeeded: false, razorpay: parsed.data.provider === "RAZORPAY" } });
    return { ok: false, error: rejected ? "The provider did not accept these keys. Check them and save again." : "The provider could not be reached. Try again shortly." };
  }
  await prisma.organisationPaymentSettings.update({ where: { organisationId }, data: { verifiedAt: new Date() } });
  await recordAuditEvent({ action: "PAYMENT_CONNECTION_TESTED", actorUserId: access.userId, organisationId, targetType: "Organisation", targetId: organisationId, metadata: { succeeded: true, razorpay: parsed.data.provider === "RAZORPAY" } });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/payments`);
  return { ok: true, data: { testMode: isProviderTestMode(row, parsed.data.provider) } };
}
