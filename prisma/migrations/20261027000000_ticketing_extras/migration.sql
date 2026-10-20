-- Ticketing extras: tickets hidden behind an access code or limited to the
-- organisation's members, pay what you want, group tickets, a booking fee
-- per ticket, and add-ons bought alongside tickets. New columns default to
-- today's behaviour; no rows change.

CREATE TYPE "TicketVisibility" AS ENUM ('PUBLIC', 'CODE', 'MEMBERS');
CREATE TYPE "TicketPricing" AS ENUM ('FIXED', 'FLEXIBLE');

ALTER TABLE "TicketType" ADD COLUMN "accessCodeDigest" TEXT,
ADD COLUMN "accessCodeHint" TEXT,
ADD COLUMN "feeMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "maxPriceMinor" BIGINT,
ADD COLUMN "pricing" "TicketPricing" NOT NULL DEFAULT 'FIXED',
ADD COLUMN "seatsPerTicket" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "suggestedMinor" BIGINT,
ADD COLUMN "visibility" "TicketVisibility" NOT NULL DEFAULT 'PUBLIC';

ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_access_code_shape" CHECK (
  ("visibility" = 'CODE') = ("accessCodeDigest" IS NOT NULL)
  AND ("accessCodeDigest" IS NULL OR "accessCodeDigest" ~ '^[a-f0-9]{64}$')
);
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_pricing_shape" CHECK (
  ("pricing" = 'FIXED' AND "suggestedMinor" IS NULL AND "maxPriceMinor" IS NULL)
  OR ("pricing" = 'FLEXIBLE'
    AND ("suggestedMinor" IS NULL OR "suggestedMinor" >= "priceMinor")
    AND ("maxPriceMinor" IS NULL OR "maxPriceMinor" >= GREATEST("priceMinor", COALESCE("suggestedMinor", 0))))
);
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_group_and_fee" CHECK ("seatsPerTicket" BETWEEN 1 AND 20 AND "feeMinor" >= 0);

ALTER TABLE "OrderLine" ADD COLUMN "addOnId" TEXT;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_kind_target" CHECK (
  ("kind" = 'TICKET' AND "addOnId" IS NULL)
  OR ("kind" = 'ADD_ON' AND "ticketTypeId" IS NULL)
  OR ("kind" = 'FEE' AND "addOnId" IS NULL)
);

CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "eventSeriesId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMinor" BIGINT NOT NULL,
    "capacity" INTEGER,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AddOn_one_target" CHECK (("eventId" IS NULL) <> ("eventSeriesId" IS NULL)),
    CONSTRAINT "AddOn_amounts" CHECK ("priceMinor" >= 0 AND ("capacity" IS NULL OR "capacity" > 0) AND "maxPerOrder" BETWEEN 1 AND 100)
);

CREATE INDEX "AddOn_eventId_sortOrder_idx" ON "AddOn"("eventId", "sortOrder");
CREATE INDEX "AddOn_eventSeriesId_sortOrder_idx" ON "AddOn"("eventSeriesId", "sortOrder");

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "AddOn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AddOn" ADD CONSTRAINT "AddOn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AddOn" ADD CONSTRAINT "AddOn_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
