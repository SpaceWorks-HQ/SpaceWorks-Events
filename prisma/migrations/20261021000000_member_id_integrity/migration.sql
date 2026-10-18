-- Member ID email throttling: when the card email was last queued.
ALTER TABLE "IdMember" ADD COLUMN "lastEmailedAt" TIMESTAMP(3);

-- The daily cap counts recent sends per organisation; this index also covers
-- the organisationId-only lookups the old single-column index served.
DROP INDEX "IdMember_organisationId_idx";
CREATE INDEX "IdMember_organisationId_lastEmailedAt_idx" ON "IdMember"("organisationId", "lastEmailedAt");

-- A member's organisationId must be its programme's organisation: replace the
-- single-column programme key with a composite one (cascade kept).
CREATE UNIQUE INDEX "IdProgramme_id_organisationId_key" ON "IdProgramme"("id", "organisationId");
ALTER TABLE "IdMember" DROP CONSTRAINT "IdMember_programmeId_fkey";
ALTER TABLE "IdMember" ADD CONSTRAINT "IdMember_programmeId_organisationId_fkey" FOREIGN KEY ("programmeId", "organisationId") REFERENCES "IdProgramme"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;
