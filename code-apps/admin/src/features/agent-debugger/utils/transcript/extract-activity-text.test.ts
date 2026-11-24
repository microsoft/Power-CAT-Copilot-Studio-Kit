import { describe, expect, it } from "vitest";
import { extractActivityText } from "./extract-activity-text";

const fromInlineHtml = (content: string) =>
  extractActivityText({ attachments: [{ contentType: "text/html", content }] });

describe("extractActivityText inline HTML attachment", () => {
  it("decodes &amp; last, so double-encoded entities stay literal text", () => {
    expect(fromInlineHtml("<p>a &lt; b &amp;&amp; c &gt; d</p>")).toBe("a < b && c > d");
    expect(fromInlineHtml("<p>Type &amp;lt;br&amp;gt; for a new line.</p>")).toBe("Type &lt;br&gt; for a new line.");
    expect(fromInlineHtml("<p>&amp;quot;x&amp;quot; and &amp;#39;y&amp;#39;</p>")).toBe("&quot;x&quot; and &#39;y&#39;");
  });
});
