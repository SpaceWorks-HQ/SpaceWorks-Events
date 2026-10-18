import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "@/lib/safeHttpUrl";

describe("safeHttpUrl", () => {
  it("accepts http and https links", () => {
    expect(safeHttpUrl("https://maps.app.goo.gl/abc123")).toBe("https://maps.app.goo.gl/abc123");
    expect(safeHttpUrl("  http://example.com/map?q=Hall  ")).toBe("http://example.com/map?q=Hall");
  });

  it("rejects empty values", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
  });

  it("rejects unsafe or unparseable schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("ftp://example.com/file")).toBeNull();
    expect(safeHttpUrl("maps.google.com")).toBeNull();
  });
});
