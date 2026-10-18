import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { freeTierCloudEnv } from "../helpers/freeTierCloudEnv";

const script = fileURLToPath(new URL("../../scripts/check-production-env.mjs", import.meta.url));

function preflight(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  for (const [name, value] of Object.entries({ ...freeTierCloudEnv(), ...overrides })) {
    if (value !== undefined) env[name] = value;
  }
  const result = spawnSync(process.execPath, [script], { env: env as NodeJS.ProcessEnv, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("production preflight (scripts/check-production-env.mjs)", () => {
  it("passes for the free-tier cloud stack (Supabase, Upstash, R2, Brevo)", () => {
    const result = preflight();
    expect(result.output).toContain("preflight passed");
    expect(result.status).toBe(0);
  });

  it("treats DIRECT_URL as optional but requires TLS when it is set", () => {
    expect(preflight({ DIRECT_URL: undefined }).status).toBe(0);
    const result = preflight({ DIRECT_URL: "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("DIRECT_URL must require TLS");
  });

  it("rejects a transaction-pooler DATABASE_URL without pgbouncer mode", () => {
    const result = preflight({ DATABASE_URL: "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("pgbouncer=true");
  });

  it("still rejects plaintext Redis and object storage", () => {
    expect(preflight({ REDIS_URL: "redis://default:pw@example.upstash.io:6379" }).output).toContain("rediss://");
    expect(preflight({ S3_ENDPOINT: "http://0123.r2.cloudflarestorage.com" }).output).toContain("S3_ENDPOINT must use HTTPS");
  });
});
