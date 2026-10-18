-- One saved ID card (badge) design per event, shared by every check-in desk.
-- New table only: existing tables, types and indexes are untouched.
CREATE TABLE "EventBadgeDesign" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventBadgeDesign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventBadgeDesign_eventId_key" ON "EventBadgeDesign"("eventId");

CREATE INDEX "EventBadgeDesign_updatedById_idx" ON "EventBadgeDesign"("updatedById");

ALTER TABLE "EventBadgeDesign" ADD CONSTRAINT "EventBadgeDesign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventBadgeDesign" ADD CONSTRAINT "EventBadgeDesign_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
