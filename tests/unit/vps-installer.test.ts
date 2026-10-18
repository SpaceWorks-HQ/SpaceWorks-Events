import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

describe("VPS installer configuration", () => {
  it("validates bootstrap arguments before host changes", () => {
    expect(execFileSync("bash", ["install.sh", "--help"], { cwd: root, encoding: "utf8" })).toContain("--update");
    const result = spawnSync("bash", ["install.sh", "--ref", "../../bad"], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1); expect(result.stderr).toContain("Invalid release reference");
    execFileSync("bash", ["-n", "install.sh", "scripts/setup-vps.sh", "scripts/update-vps.sh", "scripts/install-docker.sh"], { cwd: root });
  });
  it("generates separate frontend credentials, refuses replacement and renews only certificates", { timeout: 30_000 }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "swe-config-test-"));
    const run = (...args: string[]) => spawnSync(process.execPath, ["docker/vps/setup.mjs", ...args], { cwd: root, env: { ...process.env, SWE_SETUP_CONFIG_DIR: directory }, encoding: "utf8" });
    try {
      const result = run("api.events.example.com", "admin@example.com", "test-release", "events.example.com");
      expect(result.status, result.stderr).toBe(0);
      const frontend = readFileSync(path.join(directory, "frontend.env"), "utf8");
      const app = readFileSync(path.join(directory, "app.env"), "utf8");
      expect(frontend).toContain("NEXT_PUBLIC_BASE_URL='https://events.example.com'");
      expect(frontend).toContain("BACKEND_ORIGIN='https://api.events.example.com'");
      expect(frontend).not.toMatch(/DATABASE_URL|AUTH_SECRET|SMTP_PASSWORD|REDIS_URL|MFA_ENCRYPTION_KEY|S3_SECRET/);
      const gateway = frontend.match(/^FRONTEND_GATEWAY_SECRET='([a-f0-9]{64})'/m)![1];
      expect(app.includes(`FRONTEND_GATEWAY_SECRET='${gateway}'`)).toBe(true);
      expect(app).toContain("DEPLOYMENT_MODE='backend'");
      expect(app).toContain("AUTH_URL='https://events.example.com'");
      for (const name of readdirSync(directory).filter((name) => name.endsWith(".env") || name === "actions-key")) expect(statSync(path.join(directory, name)).mode & 0o777).toBe(0o600);
      expect(run("api.events.example.com", "admin@example.com", "replace").status).not.toBe(0);
      const ca = readFileSync(path.join(directory, "tls/ca.key"));
      expect(run("renew-certificates").status).toBe(0);
      expect(readFileSync(path.join(directory, "tls/ca.key")).equals(ca)).toBe(true);
      expect(readFileSync(path.join(directory, "app.env"), "utf8") === app).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
