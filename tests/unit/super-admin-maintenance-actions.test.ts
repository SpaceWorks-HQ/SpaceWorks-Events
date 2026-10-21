import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdminMfa: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  deliver: vi.fn(),
  tokenDelete: vi.fn(),
  outboxUpdate: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireSuperAdminMfa: mocks.requireSuperAdminMfa }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: {
  verificationToken: { deleteMany: mocks.tokenDelete },
  outboxMessage: { updateMany: mocks.outboxUpdate },
} }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/outbox", () => ({ deliverOutboxBatch: mocks.deliver }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import {
  deliverInstanceOutbox,
  purgeExpiredVerificationTokens,
  recordBackupRestoreVerification,
  retryFailedOutboxMessages,
} from "@/app/actions/instance";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSuperAdminMfa.mockResolvedValue({ user: { id: "admin_1" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.deliver.mockResolvedValue({ sent: 2, failed: 1 });
  mocks.tokenDelete.mockResolvedValue({ count: 4 });
  mocks.outboxUpdate.mockResolvedValue({ count: 3 });
  mocks.audit.mockResolvedValue({});
});

describe("super-admin maintenance actions", () => {
  it("requeues failed email as due now (UTC Date), with a fresh retry budget and cleared lock", async () => {
    const before = Date.now();
    await expect(retryFailedOutboxMessages()).resolves.toEqual({ ok: true, data: { retried: 3 } });
    const call = mocks.outboxUpdate.mock.calls[0]![0];
    expect(call.where).toEqual({ status: "FAILED" });
    expect(call.data).toMatchObject({ status: "PENDING", attempts: 0, lockedAt: null, lastError: null });
    expect(call.data.availableAt).toBeInstanceOf(Date);
    expect(call.data.availableAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.data.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "FAILED_OUTBOX_MESSAGES_REQUEUED", actorUserId: "admin_1", metadata: { retried: 3 } }));
  });

  it("delivers a bounded batch, audits counts, and refreshes the super-admin pages", async () => {
    await expect(deliverInstanceOutbox()).resolves.toEqual({ ok: true, data: { sent: 2, failed: 1 } });
    expect(mocks.deliver).toHaveBeenCalledWith(50);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "INSTANCE_OUTBOX_DELIVERED", metadata: { sent: 2, failed: 1 } }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/super-admin", "layout");
  });

  it("purges only expired verification tokens", async () => {
    await expect(purgeExpiredVerificationTokens()).resolves.toEqual({ ok: true, data: { deleted: 4 } });
    const where = mocks.tokenDelete.mock.calls[0]![0].where;
    expect(where.expires.lt).toBeInstanceOf(Date);
  });

  it("records a restore drill as an audit event only", async () => {
    await expect(recordBackupRestoreVerification()).resolves.toEqual({ ok: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "BACKUP_RESTORE_VERIFIED", actorUserId: "admin_1" }));
    expect(mocks.outboxUpdate).not.toHaveBeenCalled();
  });

  it("turns database failures into UI-safe errors without leaking detail or revalidating", async () => {
    mocks.deliver.mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:secret@db"));
    mocks.outboxUpdate.mockRejectedValue(new Error("db down"));
    mocks.tokenDelete.mockRejectedValue(new Error("db down"));
    mocks.audit.mockRejectedValue(new Error("db down"));

    for (const action of [deliverInstanceOutbox, retryFailedOutboxMessages, purgeExpiredVerificationTokens, recordBackupRestoreVerification]) {
      const result = await action();
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/secret|ECONNREFUSED|db down/);
    }
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("lets the MFA step-up redirect propagate instead of reporting it as a failure", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/super-admin-mfa;307;" });
    mocks.requireSuperAdminMfa.mockRejectedValue(redirect);
    await expect(retryFailedOutboxMessages()).rejects.toBe(redirect);
    expect(mocks.outboxUpdate).not.toHaveBeenCalled();
  });

  it("rate limits every control before mutating", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    for (const action of [deliverInstanceOutbox, retryFailedOutboxMessages, purgeExpiredVerificationTokens, recordBackupRestoreVerification]) {
      await expect(action()).resolves.toEqual({ ok: false, error: "Too many requests. Try again shortly." });
    }
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.outboxUpdate).not.toHaveBeenCalled();
    expect(mocks.tokenDelete).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
