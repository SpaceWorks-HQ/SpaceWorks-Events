-- Paid events, part 1: per-organisation provider accounts, webhook
-- idempotency, and the instance switch. Adds tables and one defaulted column
-- only; existing rows and behaviour are unchanged (the switch defaults off).
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'STRIPE', 'OFFLINE');

ALTER TABLE "InstanceSetting" ADD COLUMN "paidEventsEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OrganisationPaymentSettings" (
    "organisationId" TEXT NOT NULL,
    "provider" "PaymentProvider",
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "razorpayKeyId" TEXT,
    "razorpayKeySecretEncrypted" TEXT,
    "razorpayWebhookSecretEncrypted" TEXT,
    "stripeSecretKeyEncrypted" TEXT,
    "stripeWebhookSecretEncrypted" TEXT,
    "stripeTestMode" BOOLEAN NOT NULL DEFAULT false,
    "webhookPathId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationPaymentSettings_pkey" PRIMARY KEY ("organisationId"),
    -- OFFLINE records hand-collected money; it is never a connected account.
    CONSTRAINT "OrganisationPaymentSettings_online_provider" CHECK ("provider" IS NULL OR "provider" <> 'OFFLINE'),
    CONSTRAINT "OrganisationPaymentSettings_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "OrganisationPaymentSettings_webhook_path_shape" CHECK ("webhookPathId" ~ '^[A-Za-z0-9_-]{24,64}$')
);

CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProcessedWebhookEvent_online_provider" CHECK ("provider" <> 'OFFLINE')
);

CREATE UNIQUE INDEX "OrganisationPaymentSettings_webhookPathId_key" ON "OrganisationPaymentSettings"("webhookPathId");
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx" ON "ProcessedWebhookEvent"("processedAt");
CREATE UNIQUE INDEX "ProcessedWebhookEvent_organisationId_provider_eventId_key" ON "ProcessedWebhookEvent"("organisationId", "provider", "eventId");

ALTER TABLE "OrganisationPaymentSettings" ADD CONSTRAINT "OrganisationPaymentSettings_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessedWebhookEvent" ADD CONSTRAINT "ProcessedWebhookEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
