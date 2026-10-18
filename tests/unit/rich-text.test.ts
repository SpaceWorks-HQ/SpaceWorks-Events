import { describe, expect, it } from "vitest";
import {
  plainTextToSafeHtml,
  richTextToPlainText,
  sanitizeRichText,
} from "@/lib/richText";

describe("event website rich text", () => {
  it("keeps constrained formatting and removes active markup", () => {
    const result = sanitizeRichText('<h2>Welcome</h2><script>alert(1)</script><a href="javascript:alert(1)">bad</a><strong>safe</strong>');
    expect(result).toContain("<h2>Welcome</h2>");
    expect(result).toContain("<strong>safe</strong>");
    expect(result).not.toContain("script");
    expect(result).not.toContain("javascript:");
  });

  it("escapes plain event descriptions before they enter an HTML render slot", () => {
    expect(plainTextToSafeHtml('<img src=x onerror="alert(1)">\nSafe & sound'))
      .toBe("&lt;img src=x onerror=\"alert(1)\"&gt;<br>Safe &amp; sound");
  });

  it("derives a compact plain-text summary from formatted About content", () => {
    expect(richTextToPlainText("<h2>Welcome</h2><p>Bring your <strong>ideas</strong>.</p>"))
      .toBe("Welcome Bring your ideas.");
  });

  it("keeps the summary as plain text rather than HTML entities", () => {
    expect(richTextToPlainText("<p>Tom &amp; Jerry’s &lt;maker&gt; night, &quot;bring kit&quot;</p>"))
      .toBe("Tom & Jerry’s <maker> night, \"bring kit\"");
    expect(richTextToPlainText("<p>&amp;lt;b&amp;gt;</p>")).toBe("&lt;b&gt;");
  });
});
