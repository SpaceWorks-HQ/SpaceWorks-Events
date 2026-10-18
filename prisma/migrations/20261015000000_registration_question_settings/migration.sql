-- Registration questions gain guidance and settings. Additive and safe for
-- existing rows: text columns default to empty strings, settings is nullable.
ALTER TABLE "EventRegistrationField" ADD COLUMN     "helpText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "placeholder" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "settings" JSONB;
