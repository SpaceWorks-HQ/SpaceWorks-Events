import "server-only";

import crypto from "crypto";
import type { OrganisationPaymentSettings, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { getRequestOrigin } from "@/lib/publicUrl";
import { decryptPaymentSecret } from "./secrets";
import type { OnlineProvider } from "./http";
import { isRazorpayTestKey, RazorpayGateway } from "./providers/razorpay";
import { StripeGateway } from "./providers/stripe";
import type { PaymentGateway } from "./providers/types";

export const ONLINE_PROVIDERS = ["RAZORPAY", "STRIPE"] as const satisfies readonly OnlineProvider[];

export function newWebhookPathId() {
  return crypto.randomBytes(18).toString("base64url");
}

export function isWebhookPathId(value: string) {
  return /^[A-Za-z0-9_-]{24,64}$/.test(value);
}

type SettingsRow = Pick<OrganisationPaymentSettings,
  | "organisationId" | "provider" | "currency" | "razorpayKeyId" | "razorpayKeySecretEncrypted"
  | "razorpayWebhookSecretEncrypted" | "stripeSecretKeyEncrypted" | "stripeWebhookSecretEncrypted" | "stripeTestMode">;

/** Every credential the provider needs, including the webhook secret settlement depends on. */
export function hasCompleteCredentials(row: SettingsRow, provider: OnlineProvider) {
  return provider === "RAZORPAY"
    ? Boolean(row.razorpayKeyId && row.razorpayKeySecretEncrypted && row.razorpayWebhookSecretEncrypted)
    : Boolean(row.stripeSecretKeyEncrypted && row.stripeWebhookSecretEncrypted);
}

export function isProviderTestMode(row: Pick<SettingsRow, "razorpayKeyId" | "stripeTestMode">, provider: OnlineProvider) {
  return provider === "RAZORPAY" ? isRazorpayTestKey(row.razorpayKeyId ?? "") : row.stripeTestMode;
}

/** The selected provider when all of its credentials are present, otherwise null. */
export function configuredProvider(row: SettingsRow | null): OnlineProvider | null {
  if (!row?.provider || row.provider === "OFFLINE") return null;
  return hasCompleteCredentials(row, row.provider) ? row.provider : null;
}

/**
 * Browser-safe status for the owner's settings page: which secrets are set,
 * never their values or ciphertext.
 */
export function paymentSettingsStatus(row: (SettingsRow & Pick<OrganisationPaymentSettings, "webhookPathId" | "verifiedAt">) | null) {
  return {
    provider: row?.provider === "RAZORPAY" || row?.provider === "STRIPE" ? row.provider : null,
    currency: row?.currency ?? "INR",
    razorpayKeyId: row?.razorpayKeyId ?? "",
    hasRazorpayKeySecret: Boolean(row?.razorpayKeySecretEncrypted),
    hasRazorpayWebhookSecret: Boolean(row?.razorpayWebhookSecretEncrypted),
    hasStripeSecretKey: Boolean(row?.stripeSecretKeyEncrypted),
    hasStripeWebhookSecret: Boolean(row?.stripeWebhookSecretEncrypted),
    razorpayTestMode: row ? isProviderTestMode(row, "RAZORPAY") : false,
    stripeTestMode: row?.stripeTestMode ?? false,
    configuredProvider: configuredProvider(row),
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    webhookPathId: row?.webhookPathId ?? null,
  };
}

export type PaymentSettingsStatus = ReturnType<typeof paymentSettingsStatus>;

export type PaymentAccount = {
  organisationId: string;
  provider: OnlineProvider;
  currency: string;
  testMode: boolean;
  gateway: PaymentGateway;
};

const settingsSelect = {
  organisationId: true, provider: true, currency: true, razorpayKeyId: true, razorpayKeySecretEncrypted: true,
  razorpayWebhookSecretEncrypted: true, stripeSecretKeyEncrypted: true, stripeWebhookSecretEncrypted: true, stripeTestMode: true,
} satisfies Prisma.OrganisationPaymentSettingsSelect;

/** A gateway for the given provider using only this organisation's own keys. */
export function gatewayFor(row: SettingsRow, provider: OnlineProvider): PaymentGateway | null {
  if (provider === "RAZORPAY") {
    if (!row.razorpayKeyId || !row.razorpayKeySecretEncrypted) return null;
    return new RazorpayGateway(row.razorpayKeyId, decryptPaymentSecret(row.organisationId, "razorpayKeySecretEncrypted", row.razorpayKeySecretEncrypted));
  }
  if (!row.stripeSecretKeyEncrypted) return null;
  return new StripeGateway(decryptPaymentSecret(row.organisationId, "stripeSecretKeyEncrypted", row.stripeSecretKeyEncrypted));
}

/**
 * The organisation's account for `provider` (default: the selected one).
 * New checkouts must use the selected, fully configured provider; settling,
 * cancelling or refunding an existing payment passes that payment's provider.
 */
export async function loadPaymentAccount(organisationId: string, provider?: OnlineProvider, client: Prisma.TransactionClient = prisma): Promise<PaymentAccount | null> {
  const row = await client.organisationPaymentSettings.findUnique({ where: { organisationId }, select: settingsSelect });
  if (!row) return null;
  const chosen = provider ?? configuredProvider(row);
  if (!chosen) return null;
  const gateway = gatewayFor(row, chosen);
  if (!gateway) return null;
  return { organisationId, provider: chosen, currency: row.currency, testMode: isProviderTestMode(row, chosen), gateway };
}

/** True when this organisation may take new online payments right now. */
export async function canAcceptOnlinePayments(organisationId: string) {
  if (!(await isPaidEventsEnabled())) return false;
  const row = await prisma.organisationPaymentSettings.findUnique({ where: { organisationId }, select: settingsSelect });
  return configuredProvider(row) !== null;
}

/** The organisation a webhook path addresses, with that provider's secret. */
export async function webhookSecretForPath(webhookPathId: string, provider: OnlineProvider) {
  if (!isWebhookPathId(webhookPathId)) return null;
  const row = await prisma.organisationPaymentSettings.findUnique({
    where: { webhookPathId },
    select: { organisationId: true, razorpayWebhookSecretEncrypted: true, stripeWebhookSecretEncrypted: true },
  });
  if (!row) return null;
  const field = provider === "RAZORPAY" ? "razorpayWebhookSecretEncrypted" : "stripeWebhookSecretEncrypted";
  const encrypted = row[field];
  if (!encrypted) return null;
  return { organisationId: row.organisationId, secret: decryptPaymentSecret(row.organisationId, field, encrypted) };
}

/**
 * Webhooks are served by the backend API host. In the split layout that is
 * BACKEND_ORIGIN; providers must never be pointed at the website host,
 * whose proxy does not forward webhooks.
 */
export async function webhookUrl(provider: OnlineProvider, webhookPathId: string) {
  let origin = await getRequestOrigin();
  const backend = process.env.BACKEND_ORIGIN?.trim();
  if (backend) {
    try { origin = new URL(backend).origin; } catch { /* keep the canonical origin */ }
  }
  return `${origin}/api/webhooks/${provider.toLowerCase()}/${webhookPathId}`;
}
