import { describe, expect, it } from "vitest";
import {
  normalizeSkillResourcePath,
  normalizeResource,
} from "../services/skill/resourceNormalizer";
import type { SkillResourceRow } from "../contracts/SkillBundle";

function makeRow(overrides: Partial<SkillResourceRow> = {}): SkillResourceRow {
  return {
    botcomponentid: "row-id",
    componentidunique: "row-unique",
    parentbotid: "bot-id",
    parentbotcomponentid: "parent-id",
    name: "scripts/run.py",
    schemaname: "agent.file.run",
    componenttype: 14,
    componentstate: 0,
    statecode: 0,
    statuscode: 1,
    versionnumber: 1,
    modifiedon: "2026-07-13T10:00:00Z",
    ...overrides,
  };
}

describe("normalizeSkillResourcePath", () => {
  it("normalizes encoded relative resource paths", () => {
    expect(normalizeSkillResourcePath("./scripts%2Frun_eval.py")).toBe("scripts/run_eval.py");
  });

  it("strips leading dot-slash prefix", () => {
    expect(normalizeSkillResourcePath("./scripts/run.py")).toBe("scripts/run.py");
  });

  it("leaves an already-clean path unchanged", () => {
    expect(normalizeSkillResourcePath("scripts/run.py")).toBe("scripts/run.py");
  });

  it("normalizes a root-level file", () => {
    expect(normalizeSkillResourcePath("SKILL.md")).toBe("SKILL.md");
  });

  it.each(["../secret.txt", "/root/a.py", "C:\\temp\\a.py", "a/../../b.py"])(
    "rejects unsafe path %s",
    (path) => expect(() => normalizeSkillResourcePath(path)).toThrow("Unsafe skill resource path"),
  );

  it("rejects paths containing null bytes", () => {
    expect(() => normalizeSkillResourcePath("scripts/\0run.py")).toThrow("Unsafe skill resource path");
  });
});

describe("normalizeResource", () => {
  it("normalizes a Python file and returns decoded text", async () => {
    const content = "print('hello')";
    const bytes = new TextEncoder().encode(content);
    // Percent-encoded path in name (primary candidate)
    const row = makeRow({ name: "./scripts%2Frun.py" });
    const result = await normalizeResource(row, bytes);

    expect(result.normalizedPath).toBe("scripts/run.py");
    expect(result.extension).toBe(".py");
    expect(result.kind).toBe("script");
    expect(result.language).toBe("python");
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.isBinary).toBe(false);
    expect(result.decodeStatus).toBe("decoded");
    expect(result.textContent).toBe(content);
    expect(result.analysisStatus).toBe("downloaded");
  });

  it("uses row.name when filedata_name is absent", async () => {
    const bytes = new TextEncoder().encode("# doc");
    const row = makeRow({ name: "references/notes.md" });
    const result = await normalizeResource(row, bytes);
    expect(result.normalizedPath).toBe("references/notes.md");
    expect(result.kind).toBe("reference");
    expect(result.language).toBe("markdown");
  });

  it("marks files over 4 MiB as oversized", async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
    const row = makeRow({ filedata_name: "big.py" });
    const result = await normalizeResource(row, bytes);
    expect(result.analysisStatus).toBe("oversized");
    // Oversized resources are released without decoding — must not claim "decoded"
    expect(result.decodeStatus).toBe("failed");
    expect(result.textContent).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("resource-oversized");
  });

  it("detects binary content with null bytes", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const row = makeRow({ filedata_name: "archive.bin" });
    const result = await normalizeResource(row, bytes);
    expect(result.isBinary).toBe(true);
    expect(result.decodeStatus).toBe("binary");
    expect(result.textContent).toBeUndefined();
  });

  it("produces a stable sha256 for known content", async () => {
    const bytes = new TextEncoder().encode("hello");
    const row = makeRow({ filedata_name: "hello.txt" });
    const result = await normalizeResource(row, bytes);
    // sha256("hello") = 2cf24dba...
    expect(result.sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("classifies JSON files correctly", async () => {
    const row = makeRow({ name: "config.json" });
    const result = await normalizeResource(row, new TextEncoder().encode("{}"));
    expect(result.kind).toBe("data");
    expect(result.language).toBe("json");
  });

  it("classifies YAML files correctly", async () => {
    const row = makeRow({ name: "config.yaml" });
    const result = await normalizeResource(row, new TextEncoder().encode("key: val"));
    expect(result.kind).toBe("data");
    expect(result.language).toBe("yaml");
  });

  it("classifies HTML files as template", async () => {
    const row = makeRow({ name: "page.html" });
    const result = await normalizeResource(row, new TextEncoder().encode("<html/>"));
    expect(result.kind).toBe("template");
    expect(result.language).toBe("html");
  });

  it("defaults unknown extensions to reference/text", async () => {
    const row = makeRow({ name: "notes.txt" });
    const result = await normalizeResource(row, new TextEncoder().encode("some text"));
    expect(result.kind).toBe("reference");
    expect(result.language).toBe("text");
  });

  it("uses botcomponentid and componentidunique from row", async () => {
    const row = makeRow({ botcomponentid: "abc123", componentidunique: "uid-xyz" });
    const result = await normalizeResource(row, new TextEncoder().encode("data"));
    expect(result.id).toBe("abc123");
    expect(result.componentIdUnique).toBe("uid-xyz");
  });

  it("uses name as primary path and filedata_name as fallback when name is unsafe", async () => {
    const row = makeRow({ name: "../unsafe.py", filedata_name: "scripts/fallback.py" });
    const result = await normalizeResource(row, new TextEncoder().encode("print('ok')"));
    expect(result.normalizedPath).toBe("scripts/fallback.py");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "path-fallback", severity: "warning" }),
    );
  });

  it("throws when both name and filedata_name are unsafe paths", async () => {
    const row = makeRow({ name: "../unsafe.py", filedata_name: "/root/evil.py" });
    await expect(normalizeResource(row, new TextEncoder().encode("data"))).rejects.toThrow(
      "Unsafe skill resource path",
    );
  });

  it("counts UTF-8 bytes for the 2 MiB truncation limit, not UTF-16 code units", async () => {
    // '€' is 1 JS char (UTF-16 code unit) but 3 UTF-8 bytes.
    // Create just over 2 MiB of UTF-8 content: ceil(2 MiB / 3) + 1 euro signs.
    const count = Math.ceil((2 * 1024 * 1024) / 3) + 1;
    const content = "€".repeat(count);
    const bytes = new TextEncoder().encode(content);
    expect(bytes.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(bytes.length).toBeLessThan(4 * 1024 * 1024); // not oversized

    const row = makeRow({ name: "large.txt" });
    const result = await normalizeResource(row, bytes);

    expect(result.decodeStatus).toBe("decoded");
    expect(result.textContent).toBeDefined();
    const retainedBytes = new TextEncoder().encode(result.textContent!).length;
    expect(retainedBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    // All retained characters must be complete '€' signs (no split code points)
    expect(result.textContent).toMatch(/^€+$/);
  });
});
