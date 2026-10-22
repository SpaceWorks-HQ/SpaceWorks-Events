-- Paid events, ledger: ticket types, orders and their lines, payments,
-- one checkout attempt per provider page, and refunds. Adds tables and
-- nullable columns only; existing registrations stay free and confirmed.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderLineKind" AS ENUM ('TICKET', 'ADD_ON', 'FEE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID_ONLINE', 'PAID_OFFLINE', 'WAIVED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CheckoutAttemptStatus" AS ENUM ('OPEN', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "RSVP" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "ticketTypeId" TEXT;

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "minPerOrder" INTEGER NOT NULL DEFAULT 1,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
    "salesStartAt" TIMESTAMP(3),
    "salesEndAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "eventId" TEXT,
    "reference" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "buyerEmail" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "holdExpiresAt" TIMESTAMP(3),
    "holdCapAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderLineKind" NOT NULL DEFAULT 'TICKET',
    "ticketTypeId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxableMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "cgstMinor" BIGINT NOT NULL DEFAULT 0,
    "sgstMinor" BIGINT NOT NULL DEFAULT 0,
    "igstMinor" BIGINT NOT NULL DEFAULT 0,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL,
    "externalPaymentId" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCheckoutAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CheckoutAttemptStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCheckoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
    "externalRefundId" TEXT,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketType_eventId_sortOrder_idx" ON "TicketType"("eventId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_id_eventId_key" ON "TicketType"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");

-- CreateIndex
CREATE INDEX "Order_organisationId_createdAt_idx" ON "Order"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_eventId_status_idx" ON "Order"("eventId", "status");

-- CreateIndex
CREATE INDEX "Order_status_holdExpiresAt_idx" ON "Order"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Order_buyerUserId_createdAt_idx" ON "Order"("buyerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_ticketTypeId_idx" ON "OrderLine"("ticketTypeId");

-- CreateIndex
CREATE INDEX "Payment_organisationId_createdAt_idx" ON "Payment"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_externalPaymentId_key" ON "Payment"("provider", "externalPaymentId");

-- CreateIndex
CREATE INDEX "PaymentCheckoutAttempt_paymentId_status_idx" ON "PaymentCheckoutAttempt"("paymentId", "status");

-- CreateIndex
CREATE INDEX "PaymentCheckoutAttempt_status_expiresAt_idx" ON "PaymentCheckoutAttempt"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutAttempt_provider_externalId_key" ON "PaymentCheckoutAttempt"("provider", "externalId");

-- CreateIndex
CREATE INDEX "PaymentRefund_paymentId_status_idx" ON "PaymentRefund"("paymentId", "status");

-- CreateIndex
CREATE INDEX "PaymentRefund_status_createdAt_idx" ON "PaymentRefund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_paymentId_externalRefundId_key" ON "PaymentRefund"("paymentId", "externalRefundId");

-- CreateIndex
CREATE INDEX "RSVP_orderId_idx" ON "RSVP"("orderId");

-- CreateIndex
CREATE INDEX "RSVP_ticketTypeId_status_idx" ON "RSVP"("ticketTypeId", "status");

-- CreateIndex
CREATE INDEX "RSVP_status_holdExpiresAt_idx" ON "RSVP"("status", "holdExpiresAt");

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheckoutAttempt" ADD CONSTRAINT "PaymentCheckoutAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_ticketTypeId_eventId_fkey" FOREIGN KEY ("ticketTypeId", "eventId") REFERENCES "TicketType"("id", "eventId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Money is positive integer minor units in an uppercase ISO currency.
ALTER TABLE "Event" ADD CONSTRAINT "Event_currency_code" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_price_nonnegative" CHECK ("priceMinor" >= 0);
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_positive_capacity" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_order_limits" CHECK ("minPerOrder" >= 1 AND "maxPerOrder" >= "minPerOrder" AND "maxPerOrder" <= 100);
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_sales_window" CHECK ("salesStartAt" IS NULL OR "salesEndAt" IS NULL OR "salesEndAt" > "salesStartAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "Order" ADD CONSTRAINT "Order_nonnegative_amounts" CHECK ("subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "feeMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_pending_hold" CHECK ("status" <> 'PENDING' OR ("holdExpiresAt" IS NOT NULL AND "holdCapAt" IS NOT NULL AND "holdCapAt" >= "holdExpiresAt"));
ALTER TABLE "Order" ADD CONSTRAINT "Order_reference_shape" CHECK ("reference" ~ '^[A-Z0-9-]{6,16}$');
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_amounts" CHECK (
  "quantity" > 0 AND "unitMinor" >= 0 AND "discountMinor" >= 0 AND "taxableMinor" >= 0 AND "taxMinor" >= 0
  AND "cgstMinor" >= 0 AND "sgstMinor" >= 0 AND "igstMinor" >= 0 AND "totalMinor" >= 0
  AND "taxRateBps" BETWEEN 0 AND 10000
);

-- A held seat always ends and belongs to an order.
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_pending_payment_hold" CHECK ("status" <> 'PENDING_PAYMENT' OR ("holdExpiresAt" IS NOT NULL AND "orderId" IS NOT NULL));

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount" CHECK ("amountMinor" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paid_shape" CHECK (
  ("status" NOT IN ('PAID_ONLINE', 'PAID_OFFLINE') OR "paidAt" IS NOT NULL)
  AND ("status" <> 'PAID_ONLINE' OR ("externalPaymentId" IS NOT NULL AND "provider" <> 'OFFLINE'))
);
-- One payment at a time is waiting on an order.
CREATE UNIQUE INDEX "Payment_one_pending_per_order" ON "Payment"("orderId") WHERE "status" = 'PENDING';

ALTER TABLE "PaymentCheckoutAttempt" ADD CONSTRAINT "PaymentCheckoutAttempt_online_provider" CHECK ("provider" <> 'OFFLINE');
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_positive_amount" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_offline_shape" CHECK (NOT "offline" OR ("externalRefundId" IS NULL AND "status" = 'SUCCEEDED'));

-- Settled payments are a ledger: amount, currency, provider and status never
-- change, and a provider payment id is never replaced once recorded.
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
     AND (NEW."status" <> OLD."status" OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt") THEN
    RAISE EXCEPTION 'Settled payments are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_ledger_guard"
  BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "payment_ledger_guard"();

-- A checkout attempt keeps its provider page once known, and a finished
-- attempt never reopens.
CREATE OR REPLACE FUNCTION "checkout_attempt_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."paymentId" <> OLD."paymentId" OR NEW."provider" <> OLD."provider"
     OR (OLD."externalId" IS NOT NULL AND NEW."externalId" IS DISTINCT FROM OLD."externalId")
     OR (OLD."status" <> 'OPEN' AND NEW."status" <> OLD."status" AND NOT (OLD."status" IN ('EXPIRED', 'CANCELLED') AND NEW."status" = 'PAID')) THEN
    RAISE EXCEPTION 'Checkout attempts are immutable once finished' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "checkout_attempt_guard"
  BEFORE UPDATE ON "PaymentCheckoutAttempt"
  FOR EACH ROW EXECUTE FUNCTION "checkout_attempt_guard"();

-- Pending plus succeeded refunds never exceed what was paid. The payment row
-- lock serialises concurrent refunds of the same payment.
CREATE OR REPLACE FUNCTION "payment_refund_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paid_amount bigint;
  paid_status "PaymentStatus";
  committed bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."paymentId" <> OLD."paymentId" OR NEW."amountMinor" <> OLD."amountMinor" OR NEW."offline" <> OLD."offline") THEN
    RAISE EXCEPTION 'Refund amounts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" <> 'PENDING' AND NEW."status" <> OLD."status" THEN
    RAISE EXCEPTION 'Settled refunds are immutable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT "amountMinor", "status" INTO paid_amount, paid_status FROM "Payment" WHERE "id" = NEW."paymentId" FOR UPDATE;
  IF paid_status NOT IN ('PAID_ONLINE', 'PAID_OFFLINE') THEN
    RAISE EXCEPTION 'Only collected payments can be refunded' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO committed FROM "PaymentRefund"
    WHERE "paymentId" = NEW."paymentId" AND "id" <> NEW."id" AND "status" IN ('PENDING', 'SUCCEEDED');
  IF NEW."status" IN ('PENDING', 'SUCCEEDED') AND committed + NEW."amountMinor" > paid_amount THEN
    RAISE EXCEPTION 'Refunds would exceed the payment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_refund_guard"
  BEFORE INSERT OR UPDATE ON "PaymentRefund"
  FOR EACH ROW EXECUTE FUNCTION "payment_refund_guard"();
