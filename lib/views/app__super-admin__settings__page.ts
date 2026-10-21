import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";

/** Only the host of the write-only webhook URL is shown; its path is the credential. */
function webhookHost(encrypted: string | null | undefined) {
  if (!encrypted) return null;
  try {
    return new URL(decryptInstanceConfigSecret(encrypted)).host;
  } catch {
    return "a saved webhook (unreadable; enter it again)";
  }
}

export async function loadSuperAdminSettingsView() {
  await requireSuperAdminMfa();
  const settings = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID } });
  return {
    initial: { emailFrom: settings?.emailFrom ?? process.env.EMAIL_FROM ?? "", smtpService: settings?.smtpService ?? process.env.SMTP_SERVICE ?? "", smtpHost: settings?.smtpHost ?? process.env.SMTP_HOST ?? "", smtpPort: String(settings?.smtpPort ?? process.env.SMTP_PORT ?? "587"), smtpSecure: settings?.smtpSecure ?? (process.env.SMTP_SECURE === "true"), smtpUser: settings?.smtpUser ?? process.env.SMTP_USER ?? "", smtpAllowUnauthenticated: settings?.smtpAllowUnauthenticated ?? (process.env.SMTP_ALLOW_UNAUTHENTICATED === "1"), googleClientId: settings?.googleClientId ?? process.env.AUTH_GOOGLE_ID ?? "", backupProvider: settings?.backupProvider ?? process.env.BACKUP_PROVIDER ?? "", backupLastSuccessAt: settings?.backupLastSuccessAt ? settings.backupLastSuccessAt.toISOString().slice(0, 16) : "", backupRetentionDays: String(settings?.backupRetentionDays ?? process.env.BACKUP_RETENTION_DAYS ?? ""), hasSmtpPassword: Boolean(settings?.smtpPasswordEncrypted ?? process.env.SMTP_PASSWORD), hasGoogleClientSecret: Boolean(settings?.googleClientSecretEncrypted ?? process.env.AUTH_GOOGLE_SECRET) },
    paidEventsEnabled: settings?.paidEventsEnabled ?? false,
    opsWebhook: { enabled: settings?.opsWebhookEnabled ?? false, includeWarnings: settings?.opsWebhookIncludeWarnings ?? true, configuredHost: webhookHost(settings?.opsWebhookUrlEncrypted) },
  };
}
