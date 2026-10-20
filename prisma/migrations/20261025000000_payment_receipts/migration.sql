-- Receipts: the organisation's registered details, and how each online
-- payment was made, as reported by Razorpay or Stripe.

ALTER TABLE "OrganisationPaymentSettings" ADD COLUMN "receiptLegalName" TEXT,
ADD COLUMN "receiptRegistrationNumber" TEXT,
ADD COLUMN "receiptAddress" TEXT;
ALTER TABLE "OrganisationPaymentSettings" ADD CONSTRAINT "OrganisationPaymentSettings_receipt_shape" CHECK (
  ("receiptLegalName" IS NULL OR char_length("receiptLegalName") BETWEEN 1 AND 200)
  AND ("receiptRegistrationNumber" IS NULL OR char_length("receiptRegistrationNumber") BETWEEN 1 AND 80)
  AND ("receiptAddress" IS NULL OR char_length("receiptAddress") BETWEEN 1 AND 500)
);

ALTER TABLE "Payment" ADD COLUMN "methodType" TEXT,
ADD COLUMN "methodSummary" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_method_shape" CHECK (
  ("methodType" IS NULL OR "methodType" ~ '^[a-z_]{1,32}$')
  AND ("methodSummary" IS NULL OR char_length("methodSummary") BETWEEN 1 AND 120)
);
