"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdminMfa } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { decryptInstanceConfigSecret, encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { invalidateOpsAlertSettings, parseOpsWebhookUrl, sendOpsWebhookTestMessage } from "@/lib/opsAlerts";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const signupSettingSchema = z.object({ allowNewUserSignups: z.boolean() });
const paidEventsSettingSchema = z.object({ paidEventsEnabled: z.boolean() }).strict();
const serviceSettingsSchema = z.object({
  emailFrom: z.string().trim().max(320).optional(),
  smtpService: z.string().trim().max(120).optional(), smtpHost: z.string().trim().max(253).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(), smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(320).optional(), smtpPassword: z.string().max(1024).optional(), smtpAllowUnauthenticated: z.boolean(),
  googleClientId: z.string().trim().max(320).optional(), googleClientSecret: z.string().max(1024).optional(),
  backupProvider: z.string().trim().max(80).optional(), backupLastSuccessAt: z.string().datetime().optional(),
  backupRetentionDays: z.coerce.number().int().min(1).max(3650).optional(),
}).superRefine((value, ctx) => {
  if (value.smtpService && value.smtpHost) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["smtpHost"], message: "Choose either an SMTP service or a host." });
  if ((value.smtpService || value.smtpHost) && !value.smtpAllowUnauthenticated && !value.smtpUser) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["smtpUser"], message: "SMTP credentials are required unless using a private relay." });
});

export async function setNewUserRegistrationEnabled(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = signupSettingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid account creation setting." };

  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, allowNewUserSignups: parsed.data.allowNewUserSignups },
    update: { allowNewUserSignups: parsed.data.allowNewUserSignups },
  });
  await recordAuditEvent({
    action: "NEW_USER_REGISTRATION_SETTING_UPDATED",
    actorUserId: session.user.id,
    targetType: "InstanceSetting",
    targetId: INSTANCE_SETTINGS_ID,
    metadata: { allowNewUserSignups: parsed.data.allowNewUserSignups },
  });
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}

/** Off by default. Turning it off stops new paid tickets; existing payments still settle and refund. */
export async function setPaidEventsEnabled(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = paidEventsSettingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid paid events setting." };

  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, paidEventsEnabled: parsed.data.paidEventsEnabled },
    update: { paidEventsEnabled: parsed.data.paidEventsEnabled },
  });
  await recordAuditEvent({
    action: "PAID_EVENTS_SETTING_UPDATED",
    actorUserId: session.user.id,
    targetType: "InstanceSetting",
    targetId: INSTANCE_SETTINGS_ID,
    metadata: { paidEventsEnabled: parsed.data.paidEventsEnabled },
  });
  revalidatePath("/super-admin/settings");
  return { ok: true };
}

export async function saveInstanceServiceSettings(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = serviceSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid instance settings." };
  const { smtpPassword, googleClientSecret, ...value } = parsed.data;
  const existing = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { smtpPasswordEncrypted: true, googleClientSecretEncrypted: true },
  });
  if ((value.smtpService || value.smtpHost) && !value.smtpAllowUnauthenticated && !smtpPassword && !existing?.smtpPasswordEncrypted) {
    return { ok: false, error: "Enter an SMTP password or use a deliberately unauthenticated private relay." };
  }
  if (value.googleClientId && !googleClientSecret && !existing?.googleClientSecretEncrypted) {
    return { ok: false, error: "Enter the Google OAuth client secret." };
  }
  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: {
      id: INSTANCE_SETTINGS_ID, ...value,
      emailFrom: value.emailFrom || null, smtpService: value.smtpService || null, smtpHost: value.smtpHost || null,
      smtpUser: value.smtpUser || null, googleClientId: value.googleClientId || null,
      backupProvider: value.backupProvider || null, backupLastSuccessAt: value.backupLastSuccessAt ? new Date(value.backupLastSuccessAt) : null,
      smtpPasswordEncrypted: smtpPassword ? encryptInstanceConfigSecret(smtpPassword) : null,
      googleClientSecretEncrypted: googleClientSecret ? encryptInstanceConfigSecret(googleClientSecret) : null,
    },
    update: {
      ...value, emailFrom: value.emailFrom || null, smtpService: value.smtpService || null, smtpHost: value.smtpHost || null,
      smtpUser: value.smtpUser || null, googleClientId: value.googleClientId || null,
      backupProvider: value.backupProvider || null, backupLastSuccessAt: value.backupLastSuccessAt ? new Date(value.backupLastSuccessAt) : null,
      ...(smtpPassword ? { smtpPasswordEncrypted: encryptInstanceConfigSecret(smtpPassword) } : {}),
      ...(googleClientSecret ? { googleClientSecretEncrypted: encryptInstanceConfigSecret(googleClientSecret) } : {}),
    },
  });
  await recordAuditEvent({
    action: "INSTANCE_SERVICE_SETTINGS_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID,
    metadata: { smtpConfigured: Boolean(value.smtpService || value.smtpHost), googleSsoConfigured: Boolean(value.googleClientId), backupConfigured: Boolean(value.backupProvider) },
  });
  revalidatePath("/login");
  revalidatePath("/super-admin/settings");
  revalidatePath("/super-admin/operations");
  return { ok: true };
}

const opsWebhookSettingsSchema = z.object({
  enabled: z.boolean(),
  includeWarnings: z.boolean(),
  url: z.string().trim().max(2048).optional(),
  removeUrl: z.boolean().optional(),
});
const opsWebhookTestSchema = z.object({ url: z.string().trim().max(2048).optional() });
const INVALID_WEBHOOK_URL = process.env.NODE_ENV === "production"
  ? "Enter a valid https:// webhook URL."
  : "Enter a valid http(s):// webhook URL.";

/** Save the operational alert webhook. The URL is write-only and encrypted. */
export async function saveOpsWebhookSettings(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = opsWebhookSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid alert webhook settings." };
  const { enabled, includeWarnings, removeUrl } = parsed.data;
  const url = parsed.data.url ? parseOpsWebhookUrl(parsed.data.url) : null;
  if (parsed.data.url && !url) return { ok: false, error: INVALID_WEBHOOK_URL };

  const existing = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { opsWebhookUrlEncrypted: true } });
  const hasUrl = Boolean(url) || (!removeUrl && Boolean(existing?.opsWebhookUrlEncrypted));
  if (enabled && !hasUrl) return { ok: false, error: "Add a webhook URL before turning alerts on." };

  const urlUpdate = url
    ? { opsWebhookUrlEncrypted: encryptInstanceConfigSecret(url) }
    : removeUrl ? { opsWebhookUrlEncrypted: null } : {};
  const flags = { opsWebhookEnabled: enabled && hasUrl, opsWebhookIncludeWarnings: includeWarnings };
  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, ...flags, ...urlUpdate },
    update: { ...flags, ...urlUpdate },
  });
  invalidateOpsAlertSettings();
  await recordAuditEvent({
    action: "OPS_WEBHOOK_SETTINGS_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID,
    metadata: { enabled: flags.opsWebhookEnabled, includeWarnings, urlChanged: Boolean(url), urlRemoved: Boolean(removeUrl && !url) },
  });
  revalidatePath("/super-admin/settings");
  return { ok: true };
}

/** Post a test message to the entered URL, or to the saved one. */
export async function sendOpsWebhookTest(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = opsWebhookTestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_WEBHOOK_URL };
  let url = parsed.data.url ? parseOpsWebhookUrl(parsed.data.url) : null;
  if (parsed.data.url && !url) return { ok: false, error: INVALID_WEBHOOK_URL };
  if (!url) {
    const existing = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { opsWebhookUrlEncrypted: true } });
    if (!existing?.opsWebhookUrlEncrypted) return { ok: false, error: "Enter a webhook URL to test." };
    try {
      url = decryptInstanceConfigSecret(existing.opsWebhookUrlEncrypted);
    } catch {
      return { ok: false, error: "The saved webhook URL could not be read. Enter it again." };
    }
  }
  const result = await sendOpsWebhookTestMessage(url);
  await recordAuditEvent({
    action: "OPS_WEBHOOK_TEST_SENT", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID,
    metadata: { delivered: result.ok, savedUrl: !parsed.data.url },
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
