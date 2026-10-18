-- Optional share code for an event's short link. Nullable, so existing events
-- are unaffected; the unique index is the final guard against collisions.
ALTER TABLE "Event" ADD COLUMN "shortCode" TEXT;

CREATE UNIQUE INDEX "Event_shortCode_key" ON "Event"("shortCode");
