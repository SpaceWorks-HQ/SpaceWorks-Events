-- Re-apply the rule from 20260915000000_unify_event_publication: an event's
-- website is released exactly when the event is published. The Overview
-- "Publish event" action used to change only Event.status, and saving the
-- event page of a published event without a page row created it unreleased,
-- so those published events stayed 404. Data only and idempotent; audience
-- rules (invite-only, approval) are enforced by the pages as before.

-- Release or withdraw existing website rows to match their event.
UPDATE "EventPage" AS page
SET "isPublished" = (event."status" = 'PUBLISHED'::"EventStatus"),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Event" AS event
WHERE event."id" = page."eventId"
  AND page."isPublished" IS DISTINCT FROM (event."status" = 'PUBLISHED'::"EventStatus");

-- Published events without any website row get a released one with defaults.
INSERT INTO "EventPage" ("id", "eventId", "isPublished", "createdAt", "updatedAt")
SELECT 'c' || substr(md5(event."id" || ':event-page:' || clock_timestamp()::text), 1, 24),
       event."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Event" AS event
WHERE event."status" = 'PUBLISHED'::"EventStatus"
  AND NOT EXISTS (SELECT 1 FROM "EventPage" AS page WHERE page."eventId" = event."id");
