import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const scripts = [
  "install.sh", "scripts/vps-lib.sh", "scripts/setup-vps.sh", "scripts/update-vps.sh", "scripts/vps-backup.sh",
  "scripts/vps-restore.sh", "scripts/vps-status.sh", "scripts/install-docker.sh",
];
// Run a snippet with the shared VPS helpers loaded; prints whatever the snippet echoes.
const lib = (snippet: string) =>
  spawnSync("bash", ["-c", `. scripts/vps-lib.sh; ${snippet}`], { cwd: root, encoding: "utf8" });

describe("VPS installer", () => {
  it("validates bootstrap arguments before checking or changing the host", () => {
    const help = execFileSync("bash", ["install.sh", "--help"], { cwd: root, encoding: "utf8" });
    expect(help).toContain("--update");
    expect(help).toContain("Silo object storage");
    for (const [args, message] of [
      [["--ref", "../../bad"], "Invalid source reference"],
      [["--release", "main"], "Invalid release tag"],
      [["--release", "v0.1.0-main.1.0123456789ab", "--ref", "main"], "Choose either --release or --ref"],
      [["--dir", "relative/path"], "absolute installation directory"],
      [["--dir", "/"], "absolute installation directory"],
      [["--unknown"], "Usage: install.sh"],
    ] as const) {
      const result = spawnSync("bash", ["install.sh", ...args], { cwd: root, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
    }
    execFileSync("bash", ["-n", ...scripts], { cwd: root });
  });

  it("installs the latest release by default, pinned to its commit and images", () => {
    const installer = readFileSync(path.join(root, "install.sh"), "utf8");
    expect(installer).toContain("/releases/latest");
    expect(installer).toContain("application/vnd.github.sha");
    expect(installer).toContain("codeload.github.com/$repository/tar.gz/$revision");
    expect(installer).toContain('"$STAGE/source/.release-version"');
  });

  it("pulls published release images and builds everything else", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "swe-release-test-"));
    const dir = directory.replaceAll("\\", "/");
    const commit = "0123456789abcdef0123456789abcdef01234567";
    try {
      expect(lib(`is_published_version 0.1.0-main.42.0123456789ab`).status).toBe(0);
      expect(lib(`is_published_version 0.1.0-feat-x.3.0123456789ab`).status).toBe(0);
      expect(lib(`is_published_version vps-0123456789ab`).status).not.toBe(0);
      expect(lib(`source_version '${dir}' ${commit}`).stdout).toBe("vps-0123456789ab");
      writeFileSync(path.join(directory, ".release-version"), "0.1.0-main.42.0123456789ab\n");
      expect(lib(`source_version '${dir}' ${commit}`).stdout).toBe("0.1.0-main.42.0123456789ab");
      expect(lib(`source_version '${dir}' ffffffffffff${commit.slice(12)}`).status).not.toBe(0);
      const settings = (version: string) => lib(
        `set_image_settings '${dir}/compose.env' ${version} SpaceWorks-HQ/SpaceWorks-Events; cat '${dir}/compose.env'`,
      ).stdout;
      // A 0.9.0 installation's separate migrator/ops image settings are dropped.
      writeFileSync(path.join(directory, "compose.env"), "SWE_VERSION='0.9.0-main.1.0123456789ab'\nSWE_APP_IMAGE='x'\nSWE_MIGRATOR_IMAGE='y'\nSWE_OPS_IMAGE='z'\n");
      expect(settings("0.1.0-main.42.0123456789ab")).toBe([
        "SWE_VERSION='0.9.0-main.1.0123456789ab'",
        "SWE_BACKEND_IMAGE='ghcr.io/spaceworks-hq/spaceworks-events-backend'",
        "SWE_FRONTEND_IMAGE='ghcr.io/spaceworks-hq/spaceworks-events-frontend'", "",
      ].join("\n"));
      expect(settings("vps-0123456789ab")).toBe("SWE_VERSION='0.9.0-main.1.0123456789ab'\nSWE_BACKEND_IMAGE=''\nSWE_FRONTEND_IMAGE=''\n");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("publishes generic multi-platform images and releases only when VERSION changes", () => {
    const workflow = readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
    expect(readFileSync(path.join(root, "VERSION"), "utf8").trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(workflow).toContain("NEXT_PUBLIC_BASE_URL=https://spaceworks-events-origin.invalid");
    expect(workflow).toContain("ubuntu-24.04-arm");
    expect(workflow).toContain("matching-refs/tags/v$base-main.");
    expect(workflow).not.toContain("TEMPORARY");
    for (const image of ["spaceworks-events-backend", "spaceworks-events-frontend"]) expect(workflow).toContain(image);
    expect(workflow).not.toMatch(/spaceworks-events-(migrator|ops)\b/);
    expect(workflow).toContain("NEXT_PUBLIC_BACKEND_ORIGIN=https://spaceworks-events-backend.invalid");
    expect(workflow).not.toMatch(/secrets\.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY|vars\.NEXT_PUBLIC_BASE_URL/);
    const entrypoint = readFileSync(path.join(root, "scripts/docker-entrypoint.sh"), "utf8");
    expect(entrypoint).toContain("spaceworks-events-origin.invalid");
    expect(entrypoint).toContain("spaceworks-events-backend.invalid");
  });

  it("runs the split layout as website and API containers behind one Caddy", () => {
    const compose = readFileSync(path.join(root, "compose.production.yml"), "utf8");
    expect(compose).toMatch(/migrator:\n(?:.*\n)*?\s+command: \["migrate"\]/);
    expect(compose).toMatch(/frontend:\n(?:.*\n)*?\s+profiles: \[split\]/);
    expect(compose).toContain('aliases: ["${PUBLIC_HOST}"]');
    const split = readFileSync(path.join(root, "docker/vps/Caddyfile.split"), "utf8");
    expect(split).toContain("reverse_proxy frontend:3000");
    expect(split).toContain("reverse_proxy app:3000");
    const wrapper = readFileSync(path.join(root, "scripts/vps-compose.sh"), "utf8");
    expect(wrapper).toContain("[ \"$(setting SWE_LAYOUT)\" != split ] || profiles='split'");
    expect(wrapper).toContain("export COMPOSE_PROFILES=\"$profiles\"");
  });

  it("accepts only well-formed answers", () => {
    const check = (fn: string, value: string) => lib(`${fn} '${value}'`).status === 0;
    expect(check("is_hostname", "events.example.com")).toBe(true);
    expect(check("is_hostname", "localhost")).toBe(false);
    expect(check("is_hostname", "bad host.example.com")).toBe(false);
    expect(check("is_email", "admin@example.com")).toBe(true);
    expect(check("is_email", "admin@example")).toBe(false);
    expect(lib(`is_env_value "Events <events@example.com>"`).status).toBe(0);
    expect(lib(`is_env_value "it's"`).status).not.toBe(0);
    expect(lib(`is_env_value 'trailing\\'`).status).not.toBe(0);
    expect(lib(`is_env_value '   '`).status).not.toBe(0);
    expect(check("is_port", "2525")).toBe(true);
    expect(check("is_port", "0")).toBe(false);
    expect(check("is_port", "65536")).toBe(false);
    expect(check("is_safe_path", "/etc/spaceworks-events")).toBe(true);
    expect(check("is_safe_path", "/etc/space works")).toBe(false);
    expect(check("is_safe_path", "relative")).toBe(false);
    expect(check("is_repository", "SpaceWorks-HQ/SpaceWorks-Events")).toBe(true);
    expect(check("is_repository", "owner/..")).toBe(false);
    expect(lib("release_version 0123456789abcdef0123456789abcdef01234567").stdout).toBe("vps-0123456789ab");
  });

  it("updates one setting in place and reads it back unquoted", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "swe-conf-test-"));
    const file = path.join(directory, "compose.env").replaceAll("\\", "/");
    try {
      const result = lib(
        `printf "%s\\n" "PUBLIC_HOST='events.example.com'" "SWE_VERSION='vps-old'" > '${file}'; ` +
        `conf_set '${file}' SWE_VERSION vps-new; conf_get '${file}' SWE_VERSION; printf ' '; conf_get '${file}' PUBLIC_HOST`,
      );
      expect(result.stdout, result.stderr).toBe("vps-new events.example.com");
      expect(readFileSync(file, "utf8").match(/^SWE_VERSION=/gm)).toHaveLength(1);
      if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally { rmSync(directory, { recursive: true, force: true }); }
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
      expect(readFileSync(path.join(directory, "compose.env"), "utf8")).toContain("SWE_LAYOUT='netlify'");
      expect(frontend).toContain("FRONTEND_TRUSTED_IP_HEADER='x-nf-client-connection-ip'");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("records the split and single layouts for Compose and Caddy", { timeout: 30_000 }, () => {
    for (const [args, expected] of [
      [["api.events.example.com", "admin@example.com", "v1", "events.example.com", "split"],
        ["SWE_LAYOUT='split'", "SITE_HOST='events.example.com'", "SWE_CADDYFILE='Caddyfile.split'", "PUBLIC_ORIGIN='https://events.example.com'"]],
      [["events.example.com", "admin@example.com", "v1"], ["SWE_LAYOUT='single'", "PUBLIC_ORIGIN='https://events.example.com'"]],
    ] as const) {
      const directory = mkdtempSync(path.join(tmpdir(), "swe-layout-test-"));
      try {
        const result = spawnSync(process.execPath, ["docker/vps/setup.mjs", ...args], { cwd: root, env: { ...process.env, SWE_SETUP_CONFIG_DIR: directory }, encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        const compose = readFileSync(path.join(directory, "compose.env"), "utf8");
        for (const line of expected) expect(compose).toContain(line);
        if (args[4] === "split") expect(readFileSync(path.join(directory, "frontend.env"), "utf8")).toContain("FRONTEND_TRUSTED_IP_HEADER='x-real-ip'");
        else expect(compose).not.toContain("SWE_CADDYFILE");
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  });

  it("stores an external bucket's settings and rejects unsafe ones", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "swe-storage-test-"));
    const good = { S3_ENDPOINT: "https://abc.r2.cloudflarestorage.com", S3_REGION: "auto", S3_BUCKET: "events-files", S3_ACCESS_KEY_ID: "key-id", S3_SECRET_ACCESS_KEY: "secret-value" };
    const run = (values: Record<string, string>) => spawnSync(process.execPath, ["docker/vps/configure-storage.mjs"], {
      cwd: root, encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", SWE_SETUP_CONFIG_DIR: directory, ...values },
    });
    try {
      writeFileSync(path.join(directory, "app.env"), "AUTH_SECRET='x'\nS3_BUCKET='spaceworks-events'\nS3_ENDPOINT='https://storage:9000'\n");
      const result = run(good);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain("secret-value");
      const app = readFileSync(path.join(directory, "app.env"), "utf8");
      expect(app).toContain("AUTH_SECRET='x'");
      expect(app).toContain("S3_ENDPOINT='https://abc.r2.cloudflarestorage.com'");
      expect(app).toContain("S3_SECRET_ACCESS_KEY='secret-value'");
      expect(app).toContain("S3_FORCE_PATH_STYLE='1'");
      expect(app.match(/^S3_BUCKET=/gm)).toHaveLength(1);
      for (const bad of [{ S3_ENDPOINT: "http://abc.example.com" }, { S3_ENDPOINT: "https://abc.example.com/path" }, { S3_BUCKET: "Bad_Bucket" }, { S3_SECRET_ACCESS_KEY: "it's" }]) {
        expect(run({ ...good, ...bad }).status, JSON.stringify(bad)).not.toBe(0);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("picks the official runner build only with one published checksum", () => {
    const python = spawnSync("python3", ["--version"]).status === 0 ? "python3" : "python";
    if (spawnSync(python, ["--version"]).status !== 0) return;
    const sha = "a".repeat(64);
    const release = (body: string, digest = "") => JSON.stringify({
      tag_name: "v2.330.0", draft: false, prerelease: false, published_at: "2026-10-01T00:00:00Z", body,
      assets: [{ name: "actions-runner-linux-x64-2.330.0.tar.gz", digest, browser_download_url: "https://github.com/actions/runner/releases/download/v2.330.0/actions-runner-linux-x64-2.330.0.tar.gz" }],
    });
    const pick = (input: string) => spawnSync(python, ["scripts/runner-release.py", "x64"], { cwd: root, input, encoding: "utf8" });
    const ok = pick(release(`actions-runner-linux-x64-2.330.0.tar.gz <!-- BEGIN SHA linux-x64 -->${sha}<!-- END SHA linux-x64 -->`));
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout.trim().split(/\r?\n/)).toEqual([
      "https://github.com/actions/runner/releases/download/v2.330.0/actions-runner-linux-x64-2.330.0.tar.gz", sha,
    ]);
    expect(pick(release("no checksum here")).status).not.toBe(0);
    expect(pick(release(`actions-runner-linux-x64-2.330.0.tar.gz ${sha}`, `sha256:${"b".repeat(64)}`)).status).not.toBe(0);
  });

  it("chooses HTTPS and storage like SpaceWorks: Caddy and Silo unless replaced", () => {
    const wrapper = readFileSync(path.join(root, "scripts/vps-compose.sh"), "utf8");
    expect(wrapper).toContain('[ "$tls" = proxy ] || profiles=${profiles:+$profiles,}caddy');
    expect(wrapper).toContain('[ "$storage" = external ] || profiles=${profiles:+$profiles,}silo');
    const compose = readFileSync(path.join(root, "compose.production.yml"), "utf8");
    expect(compose).toMatch(/proxy:\n\s+profiles: \[caddy\]/);
    expect(compose).toMatch(/storage:\n\s+profiles: \[silo\]/);
    expect(readFileSync(path.join(root, "compose.external-proxy.yml"), "utf8")).toContain('"127.0.0.1:8080:3000"');
    expect(readFileSync(path.join(root, "compose.external-storage.yml"), "utf8")).toContain("depends_on: !override");
    const workflow = readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("runs-on: [self-hosted, spaceworks-events-prod]");
    expect(workflow).toContain("vars.SWE_DEPLOY == 'true'");
    expect(workflow).not.toMatch(/deploy:[\s\S]*actions\/checkout/);
  });
});
