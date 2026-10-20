-- Paid series: ticket types and promo codes for a series (one date's
-- tickets, or a pass for every remaining date), a currency and refund policy
-- per series, a capacity and a cancelled state per date, and orders that
-- point at their series and date. Only constraints are replaced; no rows change.

CREATE TYPE "TicketTypeKind" AS ENUM ('SINGLE', 'PASS');

-- A ticket type's event or series is now checked by a trigger, which also
-- covers registrations for series dates; the composite keys could not.
ALTER TABLE "PromoCode" DROP CONSTRAINT "PromoCode_ticketTypeId_eventId_fkey";
ALTER TABLE "RSVP" DROP CONSTRAINT "RSVP_ticketTypeId_eventId_fkey";
DROP INDEX "TicketType_id_eventId_key";

ALTER TABLE "EventInstance" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "capacity" INTEGER;
ALTER TABLE "EventInstance" ADD CONSTRAINT "EventInstance_positive_capacity" CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "EventSeries" ADD COLUMN "currency" TEXT,
ADD COLUMN "refundPolicyHours" INTEGER,
ADD COLUMN "refundPolicyKind" "RefundPolicyKind" NOT NULL DEFAULT 'NONE',
ADD COLUMN "refundPolicyPercent" INTEGER,
ADD COLUMN "refundPolicyText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_currency_code" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_refund_policy_shape" CHECK (
  ("refundPolicyKind" = 'NONE' AND "refundPolicyHours" IS NULL AND "refundPolicyPercent" IS NULL)
  OR ("refundPolicyKind" = 'FULL_UNTIL' AND "refundPolicyHours" BETWEEN 0 AND 8760 AND "refundPolicyPercent" IS NULL)
  OR ("refundPolicyKind" = 'PERCENT_UNTIL' AND "refundPolicyHours" BETWEEN 0 AND 8760 AND "refundPolicyPercent" BETWEEN 1 AND 99)
);

ALTER TABLE "Order" ADD COLUMN "eventInstanceId" TEXT,
ADD COLUMN "eventSeriesId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_one_target" CHECK (
  NOT ("eventId" IS NOT NULL AND "eventSeriesId" IS NOT NULL)
  AND ("eventInstanceId" IS NULL OR "eventSeriesId" IS NOT NULL)
);

ALTER TABLE "PromoCode" ADD COLUMN "eventSeriesId" TEXT,
ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_one_target" CHECK (("eventId" IS NULL) <> ("eventSeriesId" IS NULL));

ALTER TABLE "TicketType" ADD COLUMN "eventSeriesId" TEXT,
ADD COLUMN "kind" "TicketTypeKind" NOT NULL DEFAULT 'SINGLE',
ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_one_target" CHECK (
  ("eventId" IS NULL) <> ("eventSeriesId" IS NULL)
  AND ("kind" = 'SINGLE' OR "eventSeriesId" IS NOT NULL)
);

CREATE INDEX "PromoCode_eventSeriesId_archivedAt_idx" ON "PromoCode"("eventSeriesId", "archivedAt");
CREATE UNIQUE INDEX "PromoCode_eventSeriesId_codeDigest_key" ON "PromoCode"("eventSeriesId", "codeDigest");
CREATE INDEX "TicketType_eventSeriesId_sortOrder_idx" ON "TicketType"("eventSeriesId", "sortOrder");
CREATE INDEX "Order_eventSeriesId_status_idx" ON "Order"("eventSeriesId", "status");
CREATE INDEX "Order_eventInstanceId_idx" ON "Order"("eventInstanceId");

ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventInstanceId_fkey" FOREIGN KEY ("eventInstanceId") REFERENCES "EventInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- Orders are only deleted with their organisation. Their tickets go with
-- them rather than being detached first, which a held ticket cannot be
-- (RSVP_pending_payment_hold) when the cascade reaches it via a series.
ALTER TABLE "RSVP" DROP CONSTRAINT "RSVP_orderId_fkey";
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- A ticket type never moves to another event or series, or changes kind.
CREATE OR REPLACE FUNCTION "ticket_type_target_fixed"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."eventId" IS DISTINCT FROM OLD."eventId" OR NEW."eventSeriesId" IS DISTINCT FROM OLD."eventSeriesId" OR NEW."kind" <> OLD."kind" THEN
    RAISE EXCEPTION 'A ticket type''s event, series and kind are fixed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ticket_type_target_fixed"
  BEFORE UPDATE OF "eventId", "eventSeriesId", "kind" ON "TicketType"
  FOR EACH ROW EXECUTE FUNCTION "ticket_type_target_fixed"();

-- A registration's ticket belongs to its event, or to its date's series.
CREATE OR REPLACE FUNCTION "rsvp_ticket_type_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ticket_event TEXT;
  ticket_series TEXT;
BEGIN
  IF NEW."ticketTypeId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "eventId", "eventSeriesId" INTO ticket_event, ticket_series FROM "TicketType" WHERE "id" = NEW."ticketTypeId";
  IF NEW."eventId" IS NOT NULL THEN
    IF ticket_event IS DISTINCT FROM NEW."eventId" THEN
      RAISE EXCEPTION 'The ticket belongs to another event' USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF ticket_series IS DISTINCT FROM (SELECT "eventSeriesId" FROM "EventInstance" WHERE "id" = NEW."eventInstanceId") THEN
    RAISE EXCEPTION 'The ticket belongs to another series' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "rsvp_ticket_type_target"
  BEFORE INSERT OR UPDATE OF "ticketTypeId", "eventId", "eventInstanceId" ON "RSVP"
  FOR EACH ROW EXECUTE FUNCTION "rsvp_ticket_type_target"();

-- A promo code limited to one ticket only names a ticket of its own event or series.
CREATE OR REPLACE FUNCTION "promo_code_ticket_type_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."ticketTypeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "TicketType" t
    WHERE t."id" = NEW."ticketTypeId"
      AND t."eventId" IS NOT DISTINCT FROM NEW."eventId"
      AND t."eventSeriesId" IS NOT DISTINCT FROM NEW."eventSeriesId"
  ) THEN
    RAISE EXCEPTION 'The promo code''s ticket belongs elsewhere' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "promo_code_ticket_type_target"
  BEFORE INSERT OR UPDATE OF "ticketTypeId", "eventId", "eventSeriesId" ON "PromoCode"
  FOR EACH ROW EXECUTE FUNCTION "promo_code_ticket_type_target"();

-- One currency per series, as per event.
CREATE OR REPLACE FUNCTION "series_currency_lock"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."currency" IS NOT NULL AND NEW."currency" IS DISTINCT FROM OLD."currency" THEN
    RAISE EXCEPTION 'A series''s currency cannot change once set' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "series_currency_lock"
  BEFORE UPDATE OF "currency" ON "EventSeries"
  FOR EACH ROW EXECUTE FUNCTION "series_currency_lock"();
