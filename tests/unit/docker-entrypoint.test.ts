import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const placeholder = "https://spaceworks-events-origin.invalid";
const directories: string[] = [];

// A fake Next.js build output as the release workflow produces it.
function build(files: Record<string, string>) {
  const directory = mkdtempSync(path.join(tmpdir(), "swe-entrypoint-"));
  directories.push(directory);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
  return directory;
}

function start(directory: string, origin?: string) {
  return spawnSync("sh", ["scripts/docker-entrypoint.sh", "echo", "server started"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, SWE_NEXT_DIR: directory.replaceAll("\\", "/"), ...(origin ? { NEXT_PUBLIC_BASE_URL: origin } : {}) },
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("runner entrypoint", () => {
  it("applies the installation's public origin to a release build before starting", () => {
    const directory = build({
      "server/app/page.js": `const base="${placeholder}";const prefix="spaceworks-events-origin.invalid/";`,
      "static/chunks/(auth)/login.js": `fetch("${placeholder}/api/health")`,
      "server/app/index.html": `<link rel="canonical" href="${placeholder}/"><meta content="https%3A%2F%2Fspaceworks-events-origin.invalid">`,
      "untouched.js": "no placeholder here",
    });
    const result = start(directory, "https://events.example.com");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("server started");
    expect(readFileSync(path.join(directory, "server/app/page.js"), "utf8"))
      .toBe('const base="https://events.example.com";const prefix="events.example.com/";');
    expect(readFileSync(path.join(directory, "static/chunks/(auth)/login.js"), "utf8")).toBe('fetch("https://events.example.com/api/health")');
    expect(readFileSync(path.join(directory, "server/app/index.html"), "utf8"))
      .toBe('<link rel="canonical" href="https://events.example.com/"><meta content="https%3A%2F%2Fevents.example.com">');
    // Starting again (a container restart) is a no-op.
    expect(start(directory, "https://events.example.com").status).toBe(0);
  });

  it("refuses to start a release build without a usable origin", () => {
    for (const origin of [undefined, "events.example.com", "https://events.example.com/", "https://evil.example.com/\";alert(1)//", "https://a.example.com|b"]) {
      const directory = build({ "server/page.js": `"${placeholder}"` });
      const result = start(directory, origin);
      expect(result.status, String(origin)).toBe(1);
      expect(result.stdout).not.toContain("server started");
      expect(readFileSync(path.join(directory, "server/page.js"), "utf8")).toBe(`"${placeholder}"`);
    }
  });

  it("leaves an image built with a real origin alone", () => {
    const directory = build({ "server/page.js": '"https://events.example.com"' });
    const result = start(directory);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("server started");
  });
});
