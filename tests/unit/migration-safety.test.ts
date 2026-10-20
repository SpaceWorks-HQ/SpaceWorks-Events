import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("production migration safety contracts", () => {
  it("preserves standalone schedule rows before replacing their legacy column", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20260828130000_event_website_program/migration.sql"), "utf8");
    const backup = sql.indexOf('CREATE TEMP TABLE "_standalone_schedule_migration"');
    const deletion = sql.indexOf('DELETE FROM "EventScheduleItem" WHERE "eventId" IS NOT NULL');
    const restore = sql.indexOf('FROM "_standalone_schedule_migration";');
    expect(backup).toBeGreaterThanOrEqual(0);
    expect(deletion).toBeGreaterThan(backup);
    expect(restore).toBeGreaterThan(deletion);
  });

  it("restores cascade-safe auditing and covers collaborator security tables", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20260829180000_production_readiness_integrity/migration.sql"), "utf8");
    expect(sql).toContain("IF TG_OP = 'DELETE' THEN\n    organisation_id := NULL;");
    expect(sql).toContain('audit_fallback_eventcollaborator"');
    expect(sql).toContain('audit_fallback_eventcollaboratorinvite"');
  });

  it("backfills immutable feedback field semantics before allowing field removal", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20260830020000_feedback_answer_snapshots/migration.sql"), "utf8");
    const addSnapshots = sql.indexOf('ADD COLUMN "fieldKey"');
    const backfill = sql.indexOf('UPDATE "EventFeedbackAnswer" AS answer');
    const notNull = sql.indexOf('ALTER COLUMN "fieldKey" SET NOT NULL');
    const setNull = sql.indexOf('ON DELETE SET NULL');
    expect(addSnapshots).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(addSnapshots);
    expect(notNull).toBeGreaterThan(backfill);
    expect(setNull).toBeGreaterThan(notNull);
  });

  it("normalizes outbox rows before enforcing the queue state machine", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20260830030000_outbox_state_integrity/migration.sql"), "utf8");
    const removeCapabilities = sql.indexOf('DELETE FROM "OutboxMessage"');
    const redactLegacyErrors = sql.indexOf("Legacy delivery failure detail redacted");
    const clearLocks = sql.indexOf('SET "lockedAt" = NULL');
    const repairSent = sql.indexOf('SET "sentAt" = COALESCE');
    const constraint = sql.indexOf('ADD CONSTRAINT "OutboxMessage_state_shape"');
    expect(removeCapabilities).toBeGreaterThanOrEqual(0);
    expect(redactLegacyErrors).toBeGreaterThan(removeCapabilities);
    expect(clearLocks).toBeGreaterThan(redactLegacyErrors);
    expect(repairSent).toBeGreaterThan(clearLocks);
    expect(constraint).toBeGreaterThan(repairSent);
  });

  it("adds event broadcasts without touching existing tables, types, or indexes", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20261013000000_event_broadcasts/migration.sql"), "utf8");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!EventBroadcast")/);
    expect(sql).toContain('CREATE TABLE "EventBroadcast"');
    expect(sql).toContain('"EventBroadcast_statuses_nonempty" CHECK (cardinality("statuses") > 0)');
    expect(sql).toContain('REFERENCES "Event"("id") ON DELETE CASCADE');
    expect(sql).toContain('REFERENCES "User"("id") ON DELETE SET NULL');
  });

  it("adds paid-event settings without touching existing data", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20261022000000_payments_core/migration.sql"), "utf8");
    expect(sql).not.toMatch(/(DROP|DELETE|UPDATE)/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!InstanceSetting"|OrganisationPaymentSettings"|ProcessedWebhookEvent")/);
    expect(sql).toContain('ADD COLUMN "paidEventsEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain(`CHECK ("provider" IS NULL OR "provider" <> 'OFFLINE')`);
    expect(sql).toContain('REFERENCES "Organisation"("id") ON DELETE CASCADE');
  });

  it("adds the PENDING_PAYMENT value in its own migration, before anything uses it", () => {
    const value = readFileSync(resolve(root, "prisma/migrations/20261022000100_rsvp_pending_payment/migration.sql"), "utf8");
    expect(value.replace(/^--.*$/gm, "").trim()).toBe(`ALTER TYPE "RsvpStatus" ADD VALUE 'PENDING_PAYMENT';`);
  });

  it("adds the payment ledger without rewriting or dropping existing data", () => {
    const sql = readFileSync(resolve(root, "prisma/migrations/20261022000200_payment_ledger/migration.sql"), "utf8");
    expect(sql).not.toMatch(/\bDROP\b|^\s*DELETE\b/im);
    expect(sql).not.toMatch(/^UPDATE /m);
    expect(sql).not.toMatch(/ADD COLUMN\s+"\w+" [^,;]*NOT NULL(?! DEFAULT)/);
    for (const trigger of ["payment_ledger_guard", "payment_refund_guard", "checkout_attempt_guard"]) expect(sql).toContain(`CREATE TRIGGER "${trigger}"`);
    expect(sql).toContain('REFERENCES "TicketType"("id", "eventId") ON DELETE NO ACTION');
    expect(sql).toContain('CREATE UNIQUE INDEX "Payment_one_pending_per_order"');
  });
});
