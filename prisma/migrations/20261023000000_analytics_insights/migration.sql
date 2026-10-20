-- Analytics insights: waitlist conversion and anonymous short-link counts.

-- When a registration joined the waitlist, and when it was offered a place.
-- A trigger keeps both up to date, whichever code path changes the status,
-- so waitlist conversion is exact without touching every registration flow.
ALTER TABLE "RSVP" ADD COLUMN "waitlistedAt" TIMESTAMP(3), ADD COLUMN "promotedAt" TIMESTAMP(3);
UPDATE "RSVP" SET "waitlistedAt" = "createdAt" WHERE "status" = 'WAITLISTED';

CREATE FUNCTION rsvp_waitlist_dates() RETURNS trigger AS $$
BEGIN
  IF NEW."status"::text = 'WAITLISTED' AND NEW."waitlistedAt" IS NULL THEN
    NEW."waitlistedAt" := CURRENT_TIMESTAMP;
  END IF;
  -- Leaving the waitlist for anything but a rejection is a promotion (a
  -- confirmed place, or a place held for payment).
  IF TG_OP = 'UPDATE' AND OLD."status"::text = 'WAITLISTED' AND NEW."status"::text NOT IN ('WAITLISTED', 'REJECTED')
     AND NEW."promotedAt" IS NULL THEN
    NEW."promotedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rsvp_waitlist_dates
  BEFORE INSERT OR UPDATE OF "status" ON "RSVP"
  FOR EACH ROW EXECUTE FUNCTION rsvp_waitlist_dates();

-- Short-link visits per event per day (in the event's timezone). Only a
-- count: no IP address, browser, referrer or person is ever stored.
CREATE TABLE "ShortLinkClickDay" (
    "eventId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShortLinkClickDay_pkey" PRIMARY KEY ("eventId", "day"),
    CONSTRAINT "ShortLinkClickDay_count_nonnegative" CHECK ("count" >= 0)
);

ALTER TABLE "ShortLinkClickDay" ADD CONSTRAINT "ShortLinkClickDay_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
