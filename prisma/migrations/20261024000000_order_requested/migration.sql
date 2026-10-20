-- Its own migration: a new enum value is usable only after the transaction
-- that adds it commits.
ALTER TYPE "OrderStatus" ADD VALUE 'REQUESTED' BEFORE 'PENDING';
