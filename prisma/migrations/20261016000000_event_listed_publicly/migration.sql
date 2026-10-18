-- Approval-required events can opt in to public listing (organisation page, Discover, search).
ALTER TABLE "Event" ADD COLUMN "listedPublicly" BOOLEAN NOT NULL DEFAULT false;
