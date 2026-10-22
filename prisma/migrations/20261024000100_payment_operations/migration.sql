-- Paid events, operations: a structured refund policy, offline payments and
-- waivers with an append-only amendment trail, and promo codes stored as
-- digests. Adds tables and nullable or defaulted columns only.

-- CreateEnum
CREATE TYPE "OfflinePaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD_TERMINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PromoDiscountKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PromoAppliesPer" AS ENUM ('TICKET', 'ORDER');

-- CreateEnum
CREATE TYPE "RefundPolicyKind" AS ENUM ('NONE', 'FULL_UNTIL', 'PERCENT_UNTIL');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "refundPolicyHours" INTEGER,
ADD COLUMN     "refundPolicyKind" "RefundPolicyKind" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "refundPolicyPercent" INTEGER,
ADD COLUMN     "refundPolicyText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "promoCodeId" TEXT,
ADD COLUMN     "refundPolicy" JSONB;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "offlineMethod" "OfflinePaymentMethod",
ADD COLUMN     "offlineReference" TEXT,
ADD COLUMN     "settledByUserId" TEXT;

-- CreateTable
CREATE TABLE "PaymentAmendment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "codeDigest" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "kind" "PromoDiscountKind" NOT NULL,
    "appliesPer" "PromoAppliesPer" NOT NULL DEFAULT 'TICKET',
    "percentOff" INTEGER,
    "amountOffMinor" BIGINT,
    "ticketTypeId" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "perOrderLimit" INTEGER,
    "maxRedemptions" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAmendment_paymentId_createdAt_idx" ON "PaymentAmendment"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PromoCode_eventId_archivedAt_idx" ON "PromoCode"("eventId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_eventId_codeDigest_key" ON "PromoCode"("eventId", "codeDigest");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_settledByUserId_fkey" FOREIGN KEY ("settledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAmendment" ADD CONSTRAINT "PaymentAmendment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAmendment" ADD CONSTRAINT "PaymentAmendment_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_ticketTypeId_eventId_fkey" FOREIGN KEY ("ticketTypeId", "eventId") REFERENCES "TicketType"("id", "eventId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_refund_policy_shape" CHECK (
  ("refundPolicyKind" = 'NONE' AND "refundPolicyHours" IS NULL AND "refundPolicyPercent" IS NULL)
  OR ("refundPolicyKind" = 'FULL_UNTIL' AND "refundPolicyHours" BETWEEN 0 AND 8760 AND "refundPolicyPercent" IS NULL)
  OR ("refundPolicyKind" = 'PERCENT_UNTIL' AND "refundPolicyHours" BETWEEN 0 AND 8760 AND "refundPolicyPercent" BETWEEN 1 AND 99)
);
-- An offline payment always says how it was collected, and only it does.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_offline_shape" CHECK (("status" = 'PAID_OFFLINE') = ("offlineMethod" IS NOT NULL));

ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_discount_shape" CHECK (
  ("kind" = 'PERCENT' AND "percentOff" BETWEEN 1 AND 100 AND "amountOffMinor" IS NULL)
  OR ("kind" = 'FIXED' AND "percentOff" IS NULL AND "amountOffMinor" > 0)
);
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_digest_shape" CHECK ("codeDigest" ~ '^[a-f0-9]{64}$');
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_limits" CHECK (
  "minQuantity" >= 1 AND ("perOrderLimit" IS NULL OR "perOrderLimit" >= 1) AND ("maxRedemptions" IS NULL OR "maxRedemptions" > 0)
);
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_valid_window" CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validUntil" > "validFrom");

ALTER TABLE "PaymentAmendment" ADD CONSTRAINT "PaymentAmendment_known_field" CHECK ("field" IN ('offlineMethod', 'offlineReference'));

-- The amendment trail is append-only.
CREATE OR REPLACE FUNCTION "payment_amendment_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Payment amendments are append-only' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "payment_amendment_append_only"
  BEFORE UPDATE ON "PaymentAmendment"
  FOR EACH ROW EXECUTE FUNCTION "payment_amendment_append_only"();

-- Settled payments also keep their offline record: corrections go into
-- PaymentAmendment.
CREATE OR REPLACE FUNCTION "payment_ledger_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organisationId" <> OLD."organisationId"
     OR NEW."orderId" <> OLD."orderId"
     OR NEW."amountMinor" <> OLD."amountMinor"
     OR NEW."currency" <> OLD."currency"
     OR NEW."provider" <> OLD."provider"
     OR NEW."testMode" <> OLD."testMode"
     OR (OLD."externalPaymentId" IS NOT NULL AND NEW."externalPaymentId" IS DISTINCT FROM OLD."externalPaymentId") THEN
    RAISE EXCEPTION 'Payment ledger fields are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('PAID_ONLINE', 'PAID_OFFLINE', 'WAIVED')
     AND (NEW."status" <> OLD."status"
       OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
       OR NEW."offlineMethod" IS DISTINCT FROM OLD."offlineMethod"
       OR NEW."offlineReference" IS DISTINCT FROM OLD."offlineReference") THEN
    RAISE EXCEPTION 'Settled payments are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
