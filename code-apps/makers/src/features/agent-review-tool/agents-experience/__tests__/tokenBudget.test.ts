import { describe, expect, it } from "vitest";
import {
  buildStandardResourceExcerpts,
  enforcePayloadBudget,
  estimateTokens,
  STANDARD_TOKEN_CEILING,
} from "../services/skill/tokenBudget";
import { bundle, bundleWithLargeResources, textResource } from "./skillTestFixtures";

describe("estimateTokens", () => {
  it("returns a positive integer for a plain object", () => {
    const tokens = estimateTokens({ key: "value" });
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it("uses ceil(JSON.stringify.length / 4)", () => {
    const value = { a: "hello" };
    const expected = Math.ceil(JSON.stringify(value).length / 4);
    expect(estimateTokens(value)).toBe(expected);
  });

  it("STANDARD_TOKEN_CEILING is 50 000", () => {
    expect(STANDARD_TOKEN_CEILING).toBe(50_000);
  });
});

describe("buildStandardResourceExcerpts", () => {
  it("prioritizes referenced scripts and records omitted resources", () => {
    const result = buildStandardResourceExcerpts(
      bundleWithLargeResources(),
      [],
      { perResourceChars: 50, totalChars: 80 },
    );
    expect(result.excerpts[0].path).toBe("scripts/referenced.py");
    expect(result.omissions.length).toBeGreaterThan(0);
  });

  it("truncates resource content to perResourceChars", () => {
    const b = bundle({
      skillMarkdown: "Run scripts/a.py.",
      resources: [textResource("scripts/a.py", "x".repeat(100))],
    });
    const result = buildStandardResourceExcerpts(b, [], { perResourceChars: 20, totalChars: 1_000 });
    expect(result.excerpts[0].content).toHaveLength(20);
    expect(result.excerpts[0].truncated).toBe(true);
  });

  it("marks excerpts as not truncated when content fits within perResourceChars", () => {
    const b = bundle({
      skillMarkdown: "Run scripts/small.py.",
      resources: [textResource("scripts/small.py", "print('hi')")],
    });
    const result = buildStandardResourceExcerpts(b, [], { perResourceChars: 50, totalChars: 1_000 });
    expect(result.excerpts[0].truncated).toBe(false);
  });

  it("omits unreferenced resources once total budget is consumed by referenced ones", () => {
    const b = bundle({
      skillMarkdown: "Run scripts/ref.py.",
      resources: [
        textResource("scripts/ref.py", "a".repeat(60)),
        textResource("references/unreferenced.md", "b".repeat(60)),
      ],
    });
    const result = buildStandardResourceExcerpts(b, [], { perResourceChars: 60, totalChars: 70 });
    expect(result.omissions.map((o) => o.path)).toContain("references/unreferenced.md");
  });
});

describe("enforcePayloadBudget", () => {
  it("returns withinBudget true when payload is already small enough", () => {
    const payload = { message: "hello" };
    const result = enforcePayloadBudget(payload, STANDARD_TOKEN_CEILING);
    expect(result.withinBudget).toBe(true);
    expect(result.omissions).toHaveLength(0);
  });

  it("removes excerpts key first when over budget", () => {
    const excerpts = Array.from({ length: 1_000 }, (_, i) => `excerpt-${i}`);
    const payload = { excerpts, other: "data" };
    // ceiling of 2 tokens forces trimming
    const result = enforcePayloadBudget(payload, 2);
    expect(result.omissions).toContain("excerpts");
    expect((result.payload as Record<string, unknown>).excerpts).toBeUndefined();
  });

  it("removes results key when still over budget after removing excerpts", () => {
    const bigArray = Array.from({ length: 1_000 }, (_, i) => ({ item: i }));
    const payload = { excerpts: bigArray, results: bigArray, meta: "x" };
    const result = enforcePayloadBudget(payload, 2);
    expect(result.omissions).toContain("excerpts");
    expect(result.omissions).toContain("results");
  });

  it("reports the token count of the returned payload", () => {
    const payload = { a: "b" };
    const result = enforcePayloadBudget(payload, STANDARD_TOKEN_CEILING);
    expect(result.tokenCount).toBe(estimateTokens(payload));
  });
});
