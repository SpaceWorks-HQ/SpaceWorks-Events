-- Its own migration: PostgreSQL only lets a new enum value be used after the
-- transaction that adds it commits, and the next migration's checks use it.
ALTER TYPE "RsvpStatus" ADD VALUE 'PENDING_PAYMENT';
