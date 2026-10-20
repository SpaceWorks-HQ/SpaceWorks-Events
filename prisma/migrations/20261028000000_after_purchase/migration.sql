-- After purchase: disputes (chargebacks) from the providers' webhooks,
-- one reminder before a day-long payment link runs out, ticket transfers
-- (off unless the organiser allows them), and paying at the desk. New
-- columns default to today's behaviour; no rows change.

CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'WON', 'LOST', 'CLOSED');

ALTER TABLE "Event" ADD COLUMN "allowTransfers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "transferCutoffHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Event" ADD CONSTRAINT "Event_transfer_cutoff" CHECK ("transferCutoffHours" BETWEEN 0 AND 8760);

ALTER TABLE "EventSeries" ADD COLUMN "allowTransfers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "transferCutoffHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_transfer_cutoff" CHECK ("transferCutoffHours" BETWEEN 0 AND 8760);

ALTER TABLE "Order" ADD COLUMN "paymentReminderSentAt" TIMESTAMP(3);

ALTER TABLE "TicketType" ADD COLUMN "payAtDesk" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PaymentDispute" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalDisputeId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "respondBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentDispute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentDispute_shape" CHECK ("provider" <> 'OFFLINE' AND "amountMinor" >= 0 AND "currency" ~ '^[A-Z]{3}$' AND char_length("reason") <= 200)
);

CREATE INDEX "PaymentDispute_paymentId_idx" ON "PaymentDispute"("paymentId");
CREATE INDEX "PaymentDispute_organisationId_status_idx" ON "PaymentDispute"("organisationId", "status");
CREATE UNIQUE INDEX "PaymentDispute_provider_externalDisputeId_key" ON "PaymentDispute"("provider", "externalDisputeId");

ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
