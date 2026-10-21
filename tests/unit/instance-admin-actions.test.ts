import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdminMfa: vi.fn(),
  rateLimit: vi.fn(),
  findSetting: vi.fn(),
  upsertSetting: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  deliver: vi.fn(),
  tokenDelete: vi.fn(),
  outboxUpdate: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireSuperAdminMfa: mocks.requireSuperAdminMfa }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: {
  instanceSetting: { findUnique: mocks.findSetting, upsert: mocks.upsertSetting },
  verificationToken: { deleteMany: mocks.tokenDelete },
  outboxMessage: { updateMany: mocks.outboxUpdate },
} }));
vi.mock("@/lib/instanceConfigSecrets", () => ({ encryptInstanceConfigSecret: mocks.encrypt, decryptInstanceConfigSecret: mocks.decrypt }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/outbox", () => ({ deliverOutboxBatch: mocks.deliver }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { saveInstanceServiceSettings, saveOpsWebhookSettings, sendOpsWebhookTest } from "@/app/actions/instance-settings";
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
  mocks.findSetting.mockResolvedValue(null);
  mocks.encrypt.mockImplementation((value: string) => `encrypted:${value}`);
  mocks.deliver.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.tokenDelete.mockResolvedValue({ count: 2 });
  mocks.outboxUpdate.mockResolvedValue({ count: 3 });
});

describe("super-admin instance mutations", () => {
  it("requires the action-level fresh MFA gate for every maintenance mutation", async () => {
    await deliverInstanceOutbox();
    await purgeExpiredVerificationTokens();
    await retryFailedOutboxMessages();
    await recordBackupRestoreVerification();

    expect(mocks.requireSuperAdminMfa).toHaveBeenCalledTimes(4);
    expect(mocks.rateLimit).toHaveBeenCalledTimes(4);
  });

  it("never passes plaintext form secrets or unknown secret fields to Prisma", async () => {
    await expect(saveInstanceServiceSettings({
      emailFrom: "sender@example.test",
      smtpHost: "smtp.example.test",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "sender@example.test",
      smtpPassword: "smtp-plaintext",
      smtpAllowUnauthenticated: false,
      googleClientId: "google-client",
      googleClientSecret: "google-plaintext",
    })).resolves.toEqual({ ok: true });

    const call = mocks.upsertSetting.mock.calls[0]?.[0];
    expect(call.create).not.toHaveProperty("smtpPassword");
    expect(call.create).not.toHaveProperty("googleClientSecret");
    expect(call.update).not.toHaveProperty("smtpPassword");
    expect(call.update).not.toHaveProperty("googleClientSecret");
    expect(call.create.smtpPasswordEncrypted).toBe("encrypted:smtp-plaintext");
    expect(call.create.googleClientSecretEncrypted).toBe("encrypted:google-plaintext");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { smtpConfigured: true, googleSsoConfigured: true, backupConfigured: false },
    }));
  });

  it("rate limits before invoking an operational mutation", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    await expect(deliverInstanceOutbox()).resolves.toEqual({
      ok: false,
      error: "Too many requests. Try again shortly.",
    });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});

describe("super-admin alert webhook settings", () => {
  const url = "https://chat.example.test/hooks/secret-hook-key";

  it("encrypts the webhook URL and keeps it out of audit metadata", async () => {
    await expect(saveOpsWebhookSettings({ enabled: true, includeWarnings: false, url })).resolves.toEqual({ ok: true });

    expect(mocks.requireSuperAdminMfa).toHaveBeenCalled();
    const upsert = mocks.upsertSetting.mock.calls[0]![0];
    expect(upsert.create).toMatchObject({ opsWebhookEnabled: true, opsWebhookIncludeWarnings: false, opsWebhookUrlEncrypted: `encrypted:${url}` });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("secret-hook-key");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "OPS_WEBHOOK_SETTINGS_UPDATED", metadata: expect.objectContaining({ urlChanged: true }) }));
  });

  it("rejects non-http(s) URLs and enabling without a URL", async () => {
    await expect(saveOpsWebhookSettings({ enabled: true, includeWarnings: true, url: "javascript:alert(1)" })).resolves.toMatchObject({ ok: false });
    await expect(saveOpsWebhookSettings({ enabled: true, includeWarnings: true })).resolves.toEqual({ ok: false, error: "Add a webhook URL before turning alerts on." });
    expect(mocks.upsertSetting).not.toHaveBeenCalled();
  });

  it("keeps the saved URL when left blank, and removing it turns alerts off", async () => {
    mocks.findSetting.mockResolvedValue({ opsWebhookUrlEncrypted: "encrypted:old" });
    await saveOpsWebhookSettings({ enabled: true, includeWarnings: true });
    expect(mocks.upsertSetting.mock.calls[0]![0].update).not.toHaveProperty("opsWebhookUrlEncrypted");

    await saveOpsWebhookSettings({ enabled: false, includeWarnings: true, removeUrl: true });
    expect(mocks.upsertSetting.mock.calls[1]![0].update).toEqual({ opsWebhookEnabled: false, opsWebhookIncludeWarnings: true, opsWebhookUrlEncrypted: null });
  });

  it("sends a test message to the saved URL and reports HTTP failures without echoing the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      mocks.findSetting.mockResolvedValue({ opsWebhookUrlEncrypted: "encrypted:saved" });
      mocks.decrypt.mockReturnValue(url);
      const result = await sendOpsWebhookTest({});
      expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "POST" }));
      expect(result).toEqual({ ok: false, error: "The webhook responded with HTTP 404." });
      expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("secret-hook-key");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
