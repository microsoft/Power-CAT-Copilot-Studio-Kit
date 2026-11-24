import { describe, expect, it } from "vitest";
import { analyzeBundleIntegrity } from "../services/skill/bundleIntegrity";
import {
  bundle,
  bundleWithDuplicatePaths,
  textResource,
} from "./skillTestFixtures";

function expectDeterministicFindingContract(finding: { fix: string; fixSteps: Array<{ order: number; action: string }>; confidence: string }) {
  expect(finding.fixSteps).toEqual([{ order: 1, action: finding.fix }]);
  expect(finding.confidence).toBe("high");
}

describe("analyzeBundleIntegrity", () => {
  it("resolves a script's local file name relative to the script directory", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When needed, run scripts/charts.py.",
      resources: [textResource("scripts/charts.py", "python charts.py bar")],
    }));

    expect(result.referencedButMissing).toHaveLength(0);
    expect(result.referenceGraph).toContainEqual({
      from: "scripts/charts.py",
      to: "scripts/charts.py",
    });
  });

  it("does not mistake a Python library import for a file reference", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When needed, run scripts/charts.py.",
      resources: [textResource("scripts/charts.py", "import matplotlib.pyplot as plt")],
    }));

    expect(result.referencedButMissing).toHaveLength(0);
    expect(result.findings.some(finding => finding.id === "BND-02:matplotlib.py")).toBe(false);
  });

  it("resolves local references using the canonical path of an uploaded resource", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When needed, run scripts/charts.py.",
      resources: [
        textResource("skill-folder/scripts/charts.py", "Read `helper.md`.", {
          normalizedPath: "scripts/charts.py",
        }),
        textResource("skill-folder/scripts/helper.md", "Local usage guidance.", {
          normalizedPath: "scripts/helper.md",
        }),
      ],
    }));

    expect(result.referencedButMissing).toHaveLength(0);
    expect(result.referenceGraph).toContainEqual({
      from: "skill-folder/scripts/charts.py",
      to: "skill-folder/scripts/helper.md",
    });
  });

  it("still reports a whole missing file name after excluding library-name fragments", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When needed, run missing.py.",
      resources: [textResource("scripts/charts.py", "import matplotlib.pyplot as plt")],
    }));

    expect(result.referencedButMissing).toEqual([
      { path: "missing.py", referencedIn: "SKILL.md" },
    ]);
  });

  it("reports referenced missing and present unreferenced resources", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "Read references/guide.md and run scripts/missing.py.",
      resources: [
        textResource("references/guide.md", "# Guide"),
        textResource("references/orphan.md", "# Orphan"),
      ],
    }));

    expect(result.referencedButMissing).toEqual([
      { path: "scripts/missing.py", referencedIn: "SKILL.md" },
    ]);
    expect(result.presentButUnreferenced).toEqual([
      { path: "references/orphan.md", note: expect.any(String) },
    ]);
    expect(result.progressiveDisclosureOk).toBe(false);
    expect(result.referenceGraph).toEqual([
      { from: "SKILL.md", to: "references/guide.md" },
      { from: "SKILL.md", to: "scripts/missing.py" },
    ]);
  });

  it("preserves canonical display paths in the reference graph", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When you need details, read references/guide.md.",
      resources: [textResource("References/Guide.md", "# Guide")],
    }));

    expect(result.progressiveDisclosureOk).toBe(true);
    expect(result.referenceGraph).toEqual([
      { from: "SKILL.md", to: "References/Guide.md" },
    ]);
    expect(result.referencedButMissing).toHaveLength(0);
    expect(result.presentButUnreferenced).toHaveLength(0);
  });

  it("recognizes referenced root-level bundle files", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown:
        "Dispatch the implementer using `./implementer-prompt.md`.",
      resources: [
        textResource("implementer-prompt.md", "# Implementer prompt"),
      ],
    }));

    expect(result.referenceGraph).toEqual([
      { from: "SKILL.md", to: "implementer-prompt.md" },
    ]);
    expect(result.referencedButMissing).toHaveLength(0);
    expect(result.presentButUnreferenced).toHaveLength(0);
  });

  it("resolves references to the bundle entry-point SKILL.md", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When needed, read references/guide.md and INDEX.yaml.",
      resources: [
        textResource("INDEX.yaml", "entry: ./SKILL.md\nfallback: SKILL.md"),
        textResource("references/guide.md", "Return to `./SKILL.md` for the main procedure."),
      ],
    }));

    expect(result.referencedButMissing).toHaveLength(0);
    expect(result.findings.filter((finding) => finding.ruleId === "BND-02")).toHaveLength(0);
    expect(result.referenceGraph).toEqual(expect.arrayContaining([
      { from: "INDEX.yaml", to: "SKILL.md" },
      { from: "references/guide.md", to: "SKILL.md" },
    ]));
  });

  it("reports each genuinely missing path once with all referencing files", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown:
        "When needed, read references/guide.md and run scripts/missing.py, then scripts/missing.py.",
      resources: [
        textResource(
          "references/guide.md",
          "Run scripts/missing.py. If needed, retry scripts/missing.py.",
        ),
      ],
    }));

    expect(result.referencedButMissing).toEqual([
      {
        path: "scripts/missing.py",
        referencedIn: "SKILL.md, references/guide.md",
      },
    ]);
    expect(result.findings.filter((finding) => finding.ruleId === "BND-02")).toEqual([
      expect.objectContaining({
        id: "BND-02:scripts/missing.py",
        resourcePath: "scripts/missing.py",
        referencedIn: "SKILL.md, references/guide.md",
        fact: 'Referenced from "SKILL.md", "references/guide.md"',
      }),
    ]);
  });

  it("deduplicates resource paths in progressive-disclosure findings", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown:
        "Use `./implementer-prompt.md`, then reuse `./implementer-prompt.md`.",
      resources: [
        textResource("implementer-prompt.md", "# Implementer prompt"),
      ],
    }));

    const finding = result.findings.find((item) => item.ruleId === "BND-05");
    expect(finding?.fact).toBe(
      "Lacks cue language for: ./implementer-prompt.md",
    );
    expect(finding?.referenceIds).toEqual(["ms-skill-authoring-rubric"]);
  });

  it("flags duplicate normalized paths and unsafe paths as errors", () => {
    const result = analyzeBundleIntegrity(bundleWithDuplicatePaths());
    const bnd01Findings = result.findings.filter((f) => f.ruleId === "BND-01");

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "BND-01", severity: "critical" }),
      ]),
    );
    expect(bnd01Findings).not.toHaveLength(0);
    bnd01Findings.forEach(expectDeterministicFindingContract);
  });

  it("flags empty and binary referenced resources explicitly", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When you need the guide, read references/empty.md and run scripts/tool.bin.",
      resources: [
        textResource("references/empty.md", ""),
        textResource("scripts/tool.bin", "binary", {
          kind: "asset",
          language: "other",
          isBinary: true,
          decodeStatus: "binary",
          textContent: undefined,
        }),
      ],
    }));

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "BND-03" }),
        expect.objectContaining({ ruleId: "BND-07" }),
      ]),
    );
  });

  it("emits a BND-04 finding for each unreferenced readable textual resource", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When you need the guide, read references/guide.md.",
      resources: [
        textResource("references/guide.md", "# Guide content"),
        textResource("references/orphan.md", "# Orphan"),
      ],
    }));

    expect(result.presentButUnreferenced).toHaveLength(1);
    expect(result.presentButUnreferenced[0]?.path).toBe("references/orphan.md");

    const bnd04Findings = result.findings.filter((f) => f.ruleId === "BND-04");
    expect(bnd04Findings).toHaveLength(1);
    expect(bnd04Findings[0]).toMatchObject({
      ruleId: "BND-04",
      severity: "low",
      resourcePath: "references/orphan.md",
    });
  });

  it("populates full GroundedSkillFinding contract fields on every BND-04 finding", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When you need the guide, read references/guide.md.",
      resources: [
        textResource("references/guide.md", "# Guide"),
        textResource("references/orphan.md", "# Orphan"),
      ],
    }));

    const bnd04 = result.findings.find((f) => f.ruleId === "BND-04")!;
    expect(bnd04).toBeDefined();
    expect(bnd04.evidence).toBeTruthy();
    expect(bnd04.recommendation).toBeTruthy();
    expectDeterministicFindingContract(bnd04);
    expect(bnd04.referenceIds).toContain("ms-skills-overview");
  });

  it("keeps every deterministic BND finding on the exact additive contract", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "Read references/missing.md, references/empty.md, references/orphan.md, and run scripts/tool.bin.",
      resources: [
        textResource("references/empty.md", ""),
        textResource("references/orphan.md", "# Orphan"),
        textResource("scripts/tool.bin", "binary", {
          kind: "asset",
          language: "other",
          isBinary: true,
          decodeStatus: "binary",
          textContent: undefined,
        }),
      ],
    }));

    const bndFindings = result.findings.filter((f) => f.ruleId.startsWith("BND-"));
    expect(bndFindings.length).toBeGreaterThan(0);
    bndFindings.forEach(expectDeterministicFindingContract);
  });

  it("deduplicates BND-03 when the same unreadable resource is referenced from multiple sources", () => {
    const result = analyzeBundleIntegrity(bundle({
      skillMarkdown: "When needed, read references/empty.md. Also see references/guide.md.",
      resources: [
        textResource("references/empty.md", ""),
        textResource("references/guide.md", "When needed, check references/empty.md for context."),
      ],
    }));

    const bnd03Findings = result.findings.filter((f) => f.ruleId === "BND-03");
    expect(bnd03Findings).toHaveLength(1);
    expect(bnd03Findings[0]).toMatchObject({
      ruleId: "BND-03",
      severity: "medium",
      resourcePath: "references/empty.md",
    });
  });
});
