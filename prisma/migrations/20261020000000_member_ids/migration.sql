-- Member IDs (ID card programmes, custom fields and members). New tables and
-- types only; existing tables are untouched. Everything cascades from the
-- organisation through IdProgramme.
-- CreateEnum
CREATE TYPE "IdProgrammeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "IdMemberStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdFieldType" AS ENUM ('TEXT', 'SELECT', 'DATE', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "IdFieldPlacement" AS ENUM ('FRONT', 'BACK', 'HIDDEN');

-- CreateEnum
CREATE TYPE "IdMemberSource" AS ENUM ('FORM', 'IMPORT', 'MANUAL');

-- CreateTable
CREATE TABLE "IdProgramme" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "IdProgrammeStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "idPrefix" TEXT NOT NULL,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "validUntil" TIMESTAMP(3),
    "validityDays" INTEGER,
    "design" JSONB,
    "watermarkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdProgrammeField" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "IdFieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placement" "IdFieldPlacement" NOT NULL DEFAULT 'FRONT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IdProgrammeField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdMember" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "photoUrl" TEXT,
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "status" "IdMemberStatus" NOT NULL DEFAULT 'PENDING',
    "source" "IdMemberSource" NOT NULL DEFAULT 'FORM',
    "idNumber" TEXT,
    "verifyToken" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdProgramme_organisationId_createdAt_idx" ON "IdProgramme"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdProgramme_organisationId_slug_key" ON "IdProgramme"("organisationId", "slug");

-- CreateIndex
CREATE INDEX "IdProgrammeField_programmeId_sortOrder_idx" ON "IdProgrammeField"("programmeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "IdProgrammeField_programmeId_key_key" ON "IdProgrammeField"("programmeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "IdMember_verifyToken_key" ON "IdMember"("verifyToken");

-- CreateIndex
CREATE INDEX "IdMember_programmeId_status_createdAt_idx" ON "IdMember"("programmeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IdMember_organisationId_idx" ON "IdMember"("organisationId");

-- CreateIndex
CREATE INDEX "IdMember_userId_idx" ON "IdMember"("userId");

-- CreateIndex
CREATE INDEX "IdMember_email_idx" ON "IdMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IdMember_programmeId_email_key" ON "IdMember"("programmeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "IdMember_programmeId_idNumber_key" ON "IdMember"("programmeId", "idNumber");

-- AddForeignKey
ALTER TABLE "IdProgramme" ADD CONSTRAINT "IdProgramme_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdProgrammeField" ADD CONSTRAINT "IdProgrammeField_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "IdProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdMember" ADD CONSTRAINT "IdMember_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "IdProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdMember" ADD CONSTRAINT "IdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
