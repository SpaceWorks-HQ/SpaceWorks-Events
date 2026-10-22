-- Per-organisation email: a sender name and reply-to on the platform server,
-- or the organisation's own SMTP server for its event email.

-- CreateTable
CREATE TABLE "OrganisationEmailSettings" (
    "organisationId" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "useOwnServer" BOOLEAN NOT NULL DEFAULT false,
    "fromAddress" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationEmailSettings_pkey" PRIMARY KEY ("organisationId")
);

-- AddForeignKey
ALTER TABLE "OrganisationEmailSettings" ADD CONSTRAINT "OrganisationEmailSettings_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the standard submission ports; the own server is used only when it is complete.
ALTER TABLE "OrganisationEmailSettings" ADD CONSTRAINT "OrganisationEmailSettings_shape" CHECK (
  ("smtpPort" IS NULL OR "smtpPort" IN (25, 465, 587, 2525))
  AND ("fromName" IS NULL OR char_length("fromName") BETWEEN 1 AND 100)
  AND ("replyTo" IS NULL OR char_length("replyTo") BETWEEN 3 AND 254)
  AND ("fromAddress" IS NULL OR char_length("fromAddress") BETWEEN 3 AND 254)
  AND ("smtpHost" IS NULL OR char_length("smtpHost") BETWEEN 1 AND 253)
  AND (NOT "useOwnServer" OR ("smtpHost" IS NOT NULL AND "smtpPort" IS NOT NULL AND "fromAddress" IS NOT NULL))
);
