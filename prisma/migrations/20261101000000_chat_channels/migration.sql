-- Team chats (Slack, Discord, Mattermost, Telegram, WhatsApp) that receive an
-- organisation's notifications.

-- CreateEnum
CREATE TYPE "ChatChannelKind" AS ENUM ('SLACK', 'DISCORD', 'MATTERMOST', 'TELEGRAM', 'WHATSAPP');

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "ChatChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveredAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatChannel_organisationId_idx" ON "ChatChannel"("organisationId");

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Known notification types only, and a bounded name.
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_shape" CHECK (
  char_length("name") BETWEEN 1 AND 80
  AND "events" <@ ARRAY['registration', 'request', 'payment', 'refund', 'cancellation', 'dispute', 'event']::TEXT[]
);
