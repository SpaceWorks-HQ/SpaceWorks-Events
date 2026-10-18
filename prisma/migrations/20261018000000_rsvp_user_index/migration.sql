-- Account pages and the personal data export read a user's own RSVPs.
CREATE INDEX "RSVP_userId_createdAt_idx" ON "RSVP"("userId", "createdAt");
