-- Organisers choose a visual design per broadcast; existing broadcasts keep the original look.
ALTER TABLE "EventBroadcast" ADD COLUMN "design" TEXT NOT NULL DEFAULT 'classic';
