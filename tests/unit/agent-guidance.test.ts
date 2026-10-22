import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(__dirname, "../..", file), "utf8").replace(/\r\n/g, "\n");

describe("agent guidance", () => {
  it("keeps CLAUDE.md identical to AGENTS.md, so every coding model reads the same rules", () => {
    expect(read("CLAUDE.md")).toBe(read("AGENTS.md"));
  });
});
