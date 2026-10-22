import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedOpsWebhook } from "@/lib/opsWebhookAddress";

afterEach(() => vi.unstubAllEnvs());

describe("alert webhook address", () => {
  it("refuses this host, its network and cloud metadata in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const url of ["https://127.0.0.1/hooks/x", "https://10.0.0.5/hooks/x", "https://169.254.169.254/latest", "https://[::1]/hooks/x", "https://192.168.1.20:8065/hooks/x"]) {
      await expect(isAllowedOpsWebhook(url)).resolves.toBe(false);
    }
  });

  it("accepts a public address", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(isAllowedOpsWebhook("https://93.184.215.14/hooks/x")).resolves.toBe(true);
  });

  it("allows a private chat server only with OPS_WEBHOOK_ALLOW_PRIVATE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPS_WEBHOOK_ALLOW_PRIVATE", "1");
    await expect(isAllowedOpsWebhook("https://192.168.1.20:8065/hooks/x")).resolves.toBe(true);
  });

  it("refuses a URL it cannot parse", async () => {
    await expect(isAllowedOpsWebhook("not a url")).resolves.toBe(false);
  });
});
