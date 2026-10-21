-- Operational alert webhook (super-admin managed). The URL carries its own
-- credential, so only an encrypted value is stored. Defaults keep alerts off.
ALTER TABLE "InstanceSetting" ADD COLUMN "opsWebhookUrlEncrypted" TEXT;
ALTER TABLE "InstanceSetting" ADD COLUMN "opsWebhookEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InstanceSetting" ADD COLUMN "opsWebhookIncludeWarnings" BOOLEAN NOT NULL DEFAULT true;
