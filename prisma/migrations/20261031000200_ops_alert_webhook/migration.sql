-- Operational alert webhook (super-admin managed). The URL carries its own
-- credential, so only an encrypted value is stored. Defaults keep alerts off.

-- AlterTable
ALTER TABLE "InstanceSetting" ADD COLUMN     "opsWebhookEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opsWebhookIncludeWarnings" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "opsWebhookUrlEncrypted" TEXT;
