import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("super-admin pages", () => {
  // The layout's check does not re-run on client navigation (partial
  // rendering), so each page must verify super-admin + MFA itself.
  it.each(pages("app/super-admin"))("%s checks super-admin MFA itself", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(/await requireSuperAdminMfa\(\)/);
  });

  // Insights are read-only views: opaque link tokens must never be loaded,
  // neither by a page nor by the view reader that feeds it across hosts.
  const readers = readdirSync("lib/views").filter((name) => name.startsWith("app__super-admin")).map((name) => join("lib/views", name));
  it.each([...pages("app/super-admin"), ...readers])("%s never selects opaque tokens", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/\btoken(Hash)?:\s*true/);
  });
});
