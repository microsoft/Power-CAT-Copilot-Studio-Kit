import { describe, expect, it } from "vitest";
import { chunkResource } from "../services/skill/chunking";
import { textResource } from "./skillTestFixtures";

describe("chunkResource", () => {
  it("chunks Python at function boundaries", async () => {
    const chunks = await chunkResource(
      textResource("scripts/a.py", [
        "def first():", "    return 1", "",
        "def second():", "    return 2",
      ].join("\n")),
      30,
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toContain("def first");
    expect(chunks[1].content).toContain("def second");
  });

  it("returns an empty array for a resource with no text content", async () => {
    const chunks = await chunkResource(
      textResource("scripts/binary.py", "", { textContent: undefined, isBinary: true }),
    );
    expect(chunks).toHaveLength(0);
  });

  it("returns a single chunk when content fits within targetChars", async () => {
    const content = "def hello():\n    return 42\n";
    const chunks = await chunkResource(textResource("scripts/small.py", content), 10_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("def hello");
    expect(chunks[0].startLine).toBe(0);
    expect(chunks[0].endLine).toBe(2);
  });

  it("chunks markdown at heading boundaries", async () => {
    const content = [
      "# Section One",
      "Content of section one.",
      "",
      "# Section Two",
      "Content of section two.",
    ].join("\n");
    const chunks = await chunkResource(textResource("references/doc.md", content), 30);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].content).toContain("# Section One");
    expect(chunks[1].content).toContain("# Section Two");
  });

  it("records resourcePath and a valid contentHash on every chunk", async () => {
    const chunks = await chunkResource(
      textResource("scripts/a.py", "def only():\n    pass\n"),
      10_000,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].resourcePath).toBe("scripts/a.py");
    expect(chunks[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falls back to line-window splitting for text resources with no boundary pattern", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const content = lines.join("\n");
    // Use a small targetChars to force multiple chunks on a text resource
    const chunks = await chunkResource(textResource("references/note.txt", content), 30);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("reports actual overlap count when a window is shorter than FALLBACK_OVERLAP_LINES", async () => {
    // 5 short text lines; targetChars=20 fits 3 lines per window → 3 chunks, each
    // overlapping its neighbour by exactly 2 lines (not 20).
    const lines = ["line0", "line1", "line2", "line3", "line4"];
    const chunks = await chunkResource(
      textResource("references/note.txt", lines.join("\n")),
      20,
    );
    expect(chunks).toHaveLength(3);
    // chunk 0 ends at line 2; chunk 1 starts at line 1 → 2 shared lines
    expect(chunks[0].overlapAfterLines).toBe(2);
    expect(chunks[1].overlapBeforeLines).toBe(2);
    // chunk 1 ends at line 3; chunk 2 starts at line 2 → 2 shared lines
    expect(chunks[1].overlapAfterLines).toBe(2);
    expect(chunks[2].overlapBeforeLines).toBe(2);
    // first chunk has no predecessor; last chunk has no successor
    expect(chunks[0].overlapBeforeLines).toBe(0);
    expect(chunks[2].overlapAfterLines).toBe(0);
  });

  it("flushes before a boundary line that exactly meets targetChars", async () => {
    // "aaa\nbbb\n" = 8 chars; "def f():\n" = 9 chars; 8 + 9 = 17 = targetChars.
    // Without the >= fix the boundary line is consumed into chunk 0 via the
    // hard-flush path; with the fix it correctly opens chunk 1.
    const content = "aaa\nbbb\ndef f():\n    return 1";
    const chunks = await chunkResource(textResource("scripts/exact.py", content), 17);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).not.toContain("def f");
    expect(chunks[1].content).toContain("def f");
  });
});
