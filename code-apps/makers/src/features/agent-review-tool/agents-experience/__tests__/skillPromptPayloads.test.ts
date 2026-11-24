import { describe, expect, it } from "vitest";
import type { ResourceChunk } from "../contracts/SkillBundle";
import type { ResourcePromptContext } from "../contracts/SkillEvaluation";
import {
  buildStandardPromptInput,
  buildResourcePromptInput,
  buildFileSynthesisPromptInput,
  buildBundleSynthesisPromptInput,
} from "../services/skill/SkillPromptPayloadBuilder";
import { bundle, textResource } from "./skillTestFixtures";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixtureChunk = (content = "actual source"): ResourceChunk => ({
  chunkId: "scripts-run-py-0",
  resourcePath: "scripts/run.py",
  index: 0,
  startLine: 1,
  endLine: 1,
  content,
  contentHash: "b".repeat(64),
  overlapBeforeLines: 0,
  overlapAfterLines: 0,
});

const fixtureChunkContext = (): ResourcePromptContext => ({
  skillContext: {
    skillName: "skill-creator",
    description: "Use when creating skills.",
    agentInstructions: "Be safe.",
    declaredPurpose: "Run the helper.",
  },
  resourceMetadata: {
    path: "scripts/run.py",
    kind: "script",
    language: "python",
    sizeBytes: 13,
    sha256: "b".repeat(64),
    referencedBy: ["SKILL.md"],
  },
  chunk: fixtureChunk(),
  deterministicFindings: [],
});

// ---------------------------------------------------------------------------
// P2-N: Standard (skill-level) prompt payload
// ---------------------------------------------------------------------------

describe("buildStandardPromptInput", () => {
  it("forms the exact P2-N AI Builder variables", () => {
    const b = bundle({ resources: [textResource("scripts/run.py", "print('hi')")] });
    const payload = buildStandardPromptInput(b, []);
    expect(Object.keys(payload).sort()).toEqual([
      "agent_instructions",
      "deterministic_findings_json",
      "resource_excerpts_json",
      "resource_manifest_json",
      "sibling_descriptions_json",
      "skill_markdown",
    ]);
  });

  it("serializes skill_markdown as raw string", () => {
    const b = bundle();
    const payload = buildStandardPromptInput(b, []);
    expect(payload.skill_markdown).toBe(b.skillMarkdown);
  });

  it("serializes sibling_descriptions_json as JSON string", () => {
    const b = bundle({ siblingDescriptions: [{ name: "other", description: "Desc" }] });
    const payload = buildStandardPromptInput(b, []);
    const parsed = JSON.parse(payload.sibling_descriptions_json);
    expect(parsed).toEqual([{ name: "other", description: "Desc" }]);
  });

  it("serializes deterministic_findings_json from the findings array", () => {
    const b = bundle();
    const payload = buildStandardPromptInput(b, []);
    expect(JSON.parse(payload.deterministic_findings_json)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P2-R: Resource chunk prompt payload
// ---------------------------------------------------------------------------

describe("buildResourcePromptInput", () => {
  it("forms the exact P2-R AI Builder variables", () => {
    const payload = buildResourcePromptInput(fixtureChunkContext());
    expect(Object.keys(payload).sort()).toEqual([
      "chunk_context_json",
      "deterministic_findings_json",
      "resource_chunk",
      "resource_metadata_json",
      "skill_context_json",
    ]);
  });

  it("passes resource_chunk as the raw chunk content string", () => {
    const ctx = fixtureChunkContext();
    const payload = buildResourcePromptInput(ctx);
    expect(payload.resource_chunk).toBe("actual source");
  });

  it("serializes skill_context_json with required fields", () => {
    const ctx = fixtureChunkContext();
    const payload = buildResourcePromptInput(ctx);
    const parsed = JSON.parse(payload.skill_context_json);
    expect(parsed.skillName).toBe("skill-creator");
    expect(parsed.agentInstructions).toBe("Be safe.");
  });

  it("serializes resource_metadata_json with path and kind", () => {
    const ctx = fixtureChunkContext();
    const payload = buildResourcePromptInput(ctx);
    const parsed = JSON.parse(payload.resource_metadata_json);
    expect(parsed.path).toBe("scripts/run.py");
    expect(parsed.kind).toBe("script");
  });

  it("serializes chunk_context_json with chunk metadata", () => {
    const ctx = fixtureChunkContext();
    const payload = buildResourcePromptInput(ctx);
    const parsed = JSON.parse(payload.chunk_context_json);
    expect(parsed.chunkId).toBe("scripts-run-py-0");
    expect(parsed.index).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// P2-F: File synthesis prompt payload
// ---------------------------------------------------------------------------

describe("buildFileSynthesisPromptInput", () => {
  it("forms the exact P2-F AI Builder variables", () => {
    const payload = buildFileSynthesisPromptInput(
      { path: "scripts/run.py", kind: "script", language: "python", sizeBytes: 13, sha256: "b".repeat(64), referencedBy: [] },
      [],
      [],
    );
    expect(Object.keys(payload).sort()).toEqual([
      "chunk_results_json",
      "deterministic_findings_json",
      "resource_metadata_json",
    ]);
  });

  it("serializes chunk_results_json from chunk evaluations", () => {
    const payload = buildFileSynthesisPromptInput(
      { path: "scripts/run.py", kind: "script", language: "python", sizeBytes: 13, sha256: "b".repeat(64), referencedBy: [] },
      [{ chunkId: "c1", status: "complete" }],
      [],
    );
    const parsed = JSON.parse(payload.chunk_results_json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].chunkId).toBe("c1");
  });
});

// ---------------------------------------------------------------------------
// P2-B: Bundle synthesis prompt payload
// ---------------------------------------------------------------------------

describe("buildBundleSynthesisPromptInput", () => {
  it("forms the exact P2-B AI Builder variables", () => {
    const b = bundle();
    const payload = buildBundleSynthesisPromptInput(b, [], {}, [], "final");
    expect(Object.keys(payload).sort()).toEqual([
      "agent_instructions",
      "bundle_integrity_json",
      "deterministic_findings_json",
      "resource_manifest_json",
      "resource_results_json",
      "sibling_descriptions_json",
      "skill_markdown",
      "skill_markdown_analysis_json",
      "synthesis_level",
    ]);
  });

  it("passes synthesis_level as the raw string value", () => {
    const b = bundle();
    const payload = buildBundleSynthesisPromptInput(b, [], {}, [], "partial");
    expect(payload.synthesis_level).toBe("partial");
  });

  it("serializes bundle_integrity_json from integrity object", () => {
    const b = bundle();
    const integrity = { referencedButMissing: [], presentButUnreferenced: [] };
    const payload = buildBundleSynthesisPromptInput(b, [], integrity, [], "final");
    const parsed = JSON.parse(payload.bundle_integrity_json);
    expect(parsed.referencedButMissing).toEqual([]);
  });
});
