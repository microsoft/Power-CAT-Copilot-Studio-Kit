import { describe, expect, it } from "vitest";
import { assembleSkillBundle } from "../services/skill/bundleAssembler";
import { resource } from "./skillTestFixtures";
import type { BotComponent } from "../../contracts/ServiceContracts";

function makeParent(overrides: Partial<BotComponent> = {}): BotComponent {
  return {
    botcomponentid: "parent",
    botid: "bot",
    componenttype: "9",
    name: "skill-creator",
    schemaname: "agent.skill.skill-creator",
    componentidunique: "parent-unique",
    content: "",
    data: "kind: InlineAgentSkill\ncontent: <!-- bic:bundle=agent.file.bundle -->",
    ...overrides,
  };
}

const context = { agentInstructions: "Be safe.", siblingDescriptions: [] };

describe("assembleSkillBundle", () => {
  it("uses child SKILL.md instead of the parent bundle marker", async () => {
    const bundle = await assembleSkillBundle(
      makeParent(),
      [
        resource("SKILL.md", "---\nname: skill-creator\ndescription: Use when creating skills.\n---\n# Steps"),
        resource("scripts/run_eval.py", "print('safe')"),
      ],
      context,
    );
    expect(bundle.source).toBe("zip-bundle");
    expect(bundle.skillMarkdown).toContain("name: skill-creator");
    expect(bundle.resources.map((item) => item.normalizedPath)).toEqual(["scripts/run_eval.py"]);
  });

  it("retains SKILL.md in the manifest even when removed from resources", async () => {
    const bundle = await assembleSkillBundle(
      makeParent(),
      [
        resource("SKILL.md", "---\nname: skill-creator\n---\n# Steps"),
        resource("scripts/run_eval.py", "print('ok')"),
      ],
      context,
    );
    const manifestPaths = bundle.manifest.map((m) => m.path);
    expect(manifestPaths).toContain("SKILL.md");
    expect(manifestPaths).toContain("scripts/run_eval.py");
    expect(bundle.resources.map((r) => r.normalizedPath)).not.toContain("SKILL.md");
  });

  it("extracts the bundle marker", async () => {
    const bundle = await assembleSkillBundle(makeParent(), [resource("SKILL.md", "# Steps")], context);
    expect(bundle.bundleMarker).toBe("agent.file.bundle");
  });

  it("produces a valid bundleHash string", async () => {
    const bundle = await assembleSkillBundle(
      makeParent(),
      [resource("SKILL.md", "# Steps")],
      context,
    );
    expect(bundle.bundleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.skillMarkdownHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a retrieval error when ZIP bundle has no SKILL.md", async () => {
    const bundle = await assembleSkillBundle(
      makeParent(),
      [resource("scripts/run.py", "print('ok')")],
      context,
    );
    expect(bundle.retrievalIssues).toContainEqual(
      expect.objectContaining({ code: "missing-skill-md", severity: "error" }),
    );
    expect(bundle.skillMarkdown).toBe("");
  });

  it("returns a retrieval error when ZIP bundle has multiple SKILL.md files", async () => {
    const bundle = await assembleSkillBundle(
      makeParent(),
      [
        resource("SKILL.md", "# first"),
        resource("skill.md", "# second"),
        resource("scripts/run.py", "print('ok')"),
      ],
      context,
    );
    expect(bundle.retrievalIssues).toContainEqual(
      expect.objectContaining({ code: "duplicate-skill-md", severity: "error" }),
    );
  });

  it("handles inline-markdown when no bundle marker is present", async () => {
    const inlineParent = makeParent({
      data: "kind: InlineAgentSkill\ncontent: |\n  ---\n  name: brainstorm\n  description: Brainstorming helper.\n  ---\n  # Steps",
    });
    const bundle = await assembleSkillBundle(inlineParent, [], context);
    expect(bundle.source).toBe("inline-markdown");
    expect(bundle.bundleMarker).toBeUndefined();
    expect(bundle.skillMarkdown).toContain("name: brainstorm");
  });

  it("sets skillComponentId and skillComponentUniqueId from parent", async () => {
    const bundle = await assembleSkillBundle(
      makeParent({ botcomponentid: "comp-abc", componentidunique: "unique-xyz" }),
      [resource("SKILL.md", "# Steps")],
      context,
    );
    expect(bundle.skillComponentId).toBe("comp-abc");
    expect(bundle.skillComponentUniqueId).toBe("unique-xyz");
  });

  it("carries through agentInstructions and siblingDescriptions from context", async () => {
    const ctx = {
      agentInstructions: "Be helpful.",
      siblingDescriptions: [{ name: "other-skill", description: "A sibling." }],
    };
    const bundle = await assembleSkillBundle(makeParent(), [resource("SKILL.md", "# Steps")], ctx);
    expect(bundle.agentInstructions).toBe("Be helpful.");
    expect(bundle.siblingDescriptions).toHaveLength(1);
  });

  it("compares SKILL.md path case-insensitively", async () => {
    const bundle = await assembleSkillBundle(
      makeParent(),
      [
        resource("Skill.MD", "---\nname: case-test\n---\n# Steps"),
        resource("scripts/run.py", "print('ok')"),
      ],
      context,
    );
    expect(bundle.source).toBe("zip-bundle");
    expect(bundle.skillMarkdown).toContain("name: case-test");
    expect(bundle.resources.map((r) => r.normalizedPath)).toEqual(["scripts/run.py"]);
  });

  it("releases text content when the 16 MiB bundle text budget is exhausted", async () => {
    // SKILL.md fills (16 MiB − 10 bytes), leaving only 10 bytes for resources
    const skillContent = "x".repeat(16 * 1024 * 1024 - 10);
    const bundle = await assembleSkillBundle(
      makeParent(),
      [
        resource("SKILL.md", skillContent),
        resource("scripts/small.py", "y".repeat(5)),   // 5 bytes — fits in 10-byte remainder
        resource("scripts/large.py", "z".repeat(20)), // 20 bytes — exceeds remainder
      ],
      context,
    );
    const small = bundle.resources.find((r) => r.normalizedPath === "scripts/small.py")!;
    const large = bundle.resources.find((r) => r.normalizedPath === "scripts/large.py")!;

    expect(small.textContent).toBeDefined();
    expect(large.textContent).toBeUndefined();
    expect(large.decodeStatus).toBe("failed");
    expect(large.issues).toContainEqual(
      expect.objectContaining({ code: "bundle-text-budget-exceeded", severity: "warning" }),
    );
  });

  it("trims whitespace from the bundle marker value", async () => {
    const parent = makeParent({
      data: "kind: InlineAgentSkill\ncontent: <!-- bic:bundle= agent.file.bundle  -->",
    });
    const bundle = await assembleSkillBundle(parent, [resource("SKILL.md", "# Steps")], context);
    expect(bundle.bundleMarker).toBe("agent.file.bundle");
    expect(bundle.source).toBe("zip-bundle");
  });
});
