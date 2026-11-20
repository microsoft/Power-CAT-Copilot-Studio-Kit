import { describe, expect, it } from "vitest";
import type { ResourceChunk } from "../contracts/SkillBundle";
import type {
  ResourceChunkEvaluation,
  StandardSkillBundleEvaluation,
  SkillResourceEvaluation,
  DeepSkillBundleEvaluation,
  CrossSkillOrchestrationEvaluation,
} from "../contracts/SkillEvaluation";
import type { GroundedSkillFinding } from "../contracts/Findings";
import {
  validateChunkEvaluation,
  validateStandardEvaluation,
  validateResourceEvaluation,
  validateDeepBundleEvaluation,
  validateOrchestrationEvaluation,
  containsUrl,
  stripUrls,
} from "../services/skill/SkillEvaluationValidator";

// ---------------------------------------------------------------------------
// Helpers
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

/** Creates a valid grounded finding for test reuse. */
function validFinding(overrides: Partial<GroundedSkillFinding> = {}): GroundedSkillFinding {
  return {
    id: "SCR-CMD-01:scripts/run.py",
    ruleId: "SCR-CMD-01",
    family: "Skills",
    severity: "critical",
    title: "OS Command Injection in Python Script",
    fact: "actual source",
    why: "Reason",
    fix: "Fix it.",
    referenceId: "cwe-78",
    ai: true,
    evidence: "actual source",
    recommendation: "Fix it.",
    fixSteps: [{ order: 1, action: "Do something" }],
    referenceIds: ["cwe-78", "owasp-command-injection"],
    confidence: "high",
    resourcePath: "scripts/run.py",
    ...overrides,
  };
}

/** Creates a minimal chunk evaluation with overrides to test validation. */
function unsafeChunkEvaluation(
  overrides: Partial<ResourceChunkEvaluation["findings"][number]> & Record<string, unknown> = {},
): ResourceChunkEvaluation {
  const baseFinding = validFinding(overrides);
  return {
    resourcePath: "scripts/run.py",
    chunkId: "scripts-run-py-0",
    status: "complete",
    observedBehaviors: [{ kind: "file-write", evidence: "actual source" }],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [{ kind: "execute", evidence: "actual source" }],
    runtimeAssumptions: [],
    findings: [baseFinding],
    purposeAlignment: { matches: true, rationale: "Good" },
    referenceIds: ["cwe-78", "owasp-command-injection"],
  };
}

function validStandardEvaluation(
  findings: GroundedSkillFinding[] = [],
): StandardSkillBundleEvaluation {
  return {
    status: "complete",
    dimensions: [
      { key: "Clarity", score: 8, rationale: "Clear" },
      { key: "Actionability", score: 7, rationale: "Actionable" },
      { key: "Scope discipline", score: 9, rationale: "Focused" },
      { key: "Composability", score: 8, rationale: "Composes" },
    ],
    findings,
    resourcePurposeAlignment: [],
    operationalAssumptions: [],
    unreviewedResources: [],
    summary: "Good skill.",
    referenceIds: ["ms-skills-create"],
  };
}

// ---------------------------------------------------------------------------
// URL detection and sanitization
// ---------------------------------------------------------------------------

describe("containsUrl", () => {
  it("detects http URLs", () => {
    expect(containsUrl("See http://example.com for details")).toBe(true);
  });

  it("detects https URLs", () => {
    expect(containsUrl("Visit https://learn.microsoft.com/docs")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(containsUrl("No links here")).toBe(false);
  });
});

describe("stripUrls", () => {
  it("removes URLs and collapses spaces", () => {
    expect(stripUrls("See https://example.com for more")).toBe("See for more");
  });

  it("leaves URL-free text intact", () => {
    expect(stripUrls("No links")).toBe("No links");
  });
});

// ---------------------------------------------------------------------------
// Chunk evaluation validation
// ---------------------------------------------------------------------------

describe("validateChunkEvaluation", () => {
  it("passes a well-formed chunk evaluation", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation(),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
    expect(result).toMatchObject({
      evaluation: {
        observedBehaviors: [{ kind: "file-write", evidence: "actual source" }],
        capabilities: [{ kind: "execute", evidence: "actual source" }],
        findings: [expect.objectContaining({ ruleId: "SCR-CMD-01" })],
      },
    });
  });

  it("marks URL-sanitized purpose rationale as partial", () => {
    const evaluation = unsafeChunkEvaluation();
    evaluation.purposeAlignment.rationale =
      "Aligned; see https://example.com/details";

    const result = validateChunkEvaluation(evaluation, fixtureChunk());

    expect(result.evaluation.status).toBe("partial");
    expect(result.evaluation.purposeAlignment.rationale).toBe("Aligned; see");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-purpose-rationale" }),
    );
  });

  it("drops evidence not present in the submitted chunk", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ evidence: "fabricated quote" }),
      fixtureChunk("actual source"),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "fabricated-evidence" }),
    );
  });

  it("drops findings without a registered rule and approved fix", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ ruleId: "UNKNOWN", fixSteps: [] }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
  });

  it("drops findings with unregistered referenceIds", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ referenceIds: ["fake-ref-id" as never] }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-references" }),
    );
  });

  it("drops findings missing recommendation", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ recommendation: "" }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
  });

  it("drops findings missing fixSteps", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ fixSteps: [] }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
  });

  it("reports resourcePath mismatch with chunk", () => {
    const eval_ = unsafeChunkEvaluation();
    eval_.resourcePath = "wrong/path.py";
    const result = validateChunkEvaluation(eval_, fixtureChunk());
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "resourcePath-mismatch" }),
    );
  });

  it("reports chunkId mismatch with chunk", () => {
    const eval_ = unsafeChunkEvaluation();
    eval_.chunkId = "wrong-chunk-id";
    const result = validateChunkEvaluation(eval_, fixtureChunk());
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "chunkId-mismatch" }),
    );
  });

  it("drops ungrounded observations and normalizes chunk identity", () => {
    const eval_ = unsafeChunkEvaluation();
    eval_.resourcePath = "wrong/path.py";
    eval_.chunkId = "wrong-chunk-id";
    eval_.status = "invalid" as ResourceChunkEvaluation["status"];
    eval_.observedBehaviors = [{ kind: "network-call", evidence: "fabricated behavior" }];
    eval_.dependencies = [{ name: "fabricated-package", kind: "import" }];
    eval_.externalEndpoints = [{
      value: "https://fabricated.example",
      evidence: "actual source",
    }];
    eval_.capabilities = [{ kind: "network", evidence: "fabricated capability" }];
    eval_.runtimeAssumptions = [{
      statement: "Fabricated runtime",
      evidence: "fabricated runtime evidence",
    }];

    const result = validateChunkEvaluation(eval_, fixtureChunk());

    expect(result.evaluation).toMatchObject({
      resourcePath: "scripts/run.py",
      chunkId: "scripts-run-py-0",
      status: "partial",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "resourcePath-mismatch",
        "chunkId-mismatch",
        "invalid-status",
        "ungrounded-observed-behavior",
        "ungrounded-dependency",
        "ungrounded-external-endpoint",
        "ungrounded-capability",
        "ungrounded-runtime-assumption",
      ]),
    );
  });

  it("marks validated output partial when semantic content is dropped", () => {
    const eval_ = unsafeChunkEvaluation();
    eval_.observedBehaviors = [{
      kind: "network-call",
      evidence: "fabricated behavior",
    }];

    const result = validateChunkEvaluation(eval_, fixtureChunk());

    expect(result.evaluation?.status).toBe("partial");
    expect(result.evaluation?.observedBehaviors).toEqual([]);
  });

  it("drops findings with URL in recommendation text", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ recommendation: "See https://evil.com/fix for details" }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-remediation" }),
    );
  });

  it("drops findings with URL in fixSteps action", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({
        fixSteps: [{ order: 1, action: "Follow http://example.com/guide" }],
      }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-remediation" }),
    );
  });

  it("drops findings with URL in why text", () => {
    const result = validateChunkEvaluation(
      unsafeChunkEvaluation({ why: "Read https://docs.example.com/risk" }),
      fixtureChunk(),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-remediation" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Standard evaluation validation
// ---------------------------------------------------------------------------

describe("validateStandardEvaluation", () => {
  it("passes a well-formed standard evaluation", () => {
    const result = validateStandardEvaluation(validStandardEvaluation());
    expect(result.issues).toHaveLength(0);
    expect(result.evaluation.dimensions).toHaveLength(4);
  });

  it("rejects dimension scores outside 0-10", () => {
    const evaluation = validStandardEvaluation();
    evaluation.dimensions[0].score = 11;
    const result = validateStandardEvaluation(evaluation);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-dimension-score" }),
    );
  });

  it("rejects when dimensions are not exactly four", () => {
    const evaluation = validStandardEvaluation();
    evaluation.dimensions = evaluation.dimensions.slice(0, 2);
    const result = validateStandardEvaluation(evaluation);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing-dimensions" }),
    );
  });

  it("rejects duplicate dimension keys", () => {
    const evaluation = validStandardEvaluation();
    evaluation.dimensions[1].key = "Clarity";
    const result = validateStandardEvaluation(evaluation);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "duplicate-dimension" }),
    );
  });

  it("drops findings with unregistered rule at standard level", () => {
    const finding = validFinding({ ruleId: "FAKE-RULE-99", evidence: "actual source" });
    const evaluation = validStandardEvaluation([finding]);
    const result = validateStandardEvaluation(evaluation, "actual source");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "unregistered-rule" }),
    );
  });

  it("drops findings with invalid references at standard level", () => {
    const finding = validFinding({ referenceIds: ["not-real" as never] });
    const evaluation = validStandardEvaluation([finding]);
    const result = validateStandardEvaluation(evaluation, "actual source");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-references" }),
    );
  });

  it("rejects Anthropic as a new top-level quality reference", () => {
    const evaluation = validStandardEvaluation();
    evaluation.referenceIds = ["ms-skills-create", "anthropic-agents"];

    const result = validateStandardEvaluation(evaluation, "actual source");

    expect(result.evaluation.referenceIds).toEqual(["ms-skills-create"]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-top-level-reference",
        message: expect.stringContaining("anthropic-agents"),
      }),
    );
  });

  it("drops findings with fabricated evidence at standard level", () => {
    const finding = validFinding({ evidence: "not in corpus" });
    const evaluation = validStandardEvaluation([finding]);
    const result = validateStandardEvaluation(evaluation, "actual source only");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "fabricated-evidence" }),
    );
  });

  it("drops findings with URL in fix text at standard level", () => {
    const finding = validFinding({ fix: "See https://evil.com/fix" });
    const evaluation = validStandardEvaluation([finding]);
    const result = validateStandardEvaluation(evaluation, "actual source");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-remediation" }),
    );
  });

  it("drops findings already supplied by the deterministic scanner", () => {
    const deterministicFinding = validFinding();
    const evaluation = validStandardEvaluation([
      { ...deterministicFinding, ai: true },
    ]);
    evaluation.referenceIds = [
      "cwe-78",
      "owasp-command-injection",
      "ms-skills-create",
    ];

    const result = validateStandardEvaluation(
      evaluation,
      "actual source",
      [deterministicFinding],
    );

    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.evaluation.referenceIds).toEqual(["ms-skills-create"]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "duplicate-deterministic-finding" }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-top-level-reference" }),
    );
  });

  it("suppresses an AI finding for a model-level rule the scanner already raised", () => {
    // A model-level deterministic finding (SKL-*, INS-*) has no resourcePath and
    // no evidence quote, so neither the id (SKL-09 vs SKL-09:skill_markdown) nor
    // the signature can match the AI's path-scoped, quoted version. Without the
    // ruleId fallback both would render as separate findings.
    const scannerFinding = validFinding({
      id: "SKL-09",
      ruleId: "SKL-09",
      resourcePath: undefined,
      evidence: undefined,
      referenceId: "ms-tools-skills",
      referenceIds: ["ms-tools-skills"],
      ai: false,
    });
    const aiFinding = validFinding({
      id: "SKL-09:skill_markdown",
      ruleId: "SKL-09",
      resourcePath: "skill_markdown",
      evidence: "actual source",
      referenceId: "ms-tools-skills",
      referenceIds: ["ms-tools-skills"],
      ai: true,
    });
    const evaluation = validStandardEvaluation([aiFinding]);
    evaluation.referenceIds = ["ms-tools-skills"];

    const result = validateStandardEvaluation(evaluation, "actual source", [
      scannerFinding,
    ]);

    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "duplicate-deterministic-finding" }),
    );
  });

  it("keeps an AI finding when the scanner finding is path-scoped to a different file", () => {
    // The ruleId fallback must apply only to unscoped model-level findings.
    // A scanner finding that names a path is a different instance, not a
    // duplicate, and must not suppress the AI's finding elsewhere.
    const scannerFinding = validFinding({
      id: "SCR-CMD-01:scripts/other.py",
      resourcePath: "scripts/other.py",
      evidence: "different evidence",
      ai: false,
    });
    const evaluation = validStandardEvaluation([validFinding()]);

    const result = validateStandardEvaluation(evaluation, "actual source", [
      scannerFinding,
    ]);

    expect(result.evaluation.findings).toHaveLength(1);
  });

  it("rebuilds top-level references from validated AI findings and quality references", () => {
    const evaluation = validStandardEvaluation([validFinding()]);

    const result = validateStandardEvaluation(evaluation, "actual source");

    expect(result.evaluation.referenceIds).toEqual([
      "cwe-78",
      "owasp-command-injection",
      "ms-skills-create",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Resource evaluation validation
// ---------------------------------------------------------------------------

describe("validateResourceEvaluation", () => {
  it("passes a valid resource evaluation", () => {
    const eval_: SkillResourceEvaluation = {
      resourcePath: "scripts/run.py",
      status: "complete",
      riskLevel: "medium",
      readiness: "ready",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: [],
      purposeAlignment: { matches: true, rationale: "Aligned" },
      analyzedChunks: 1,
      totalChunks: 1,
      referenceIds: [],
    };
    const result = validateResourceEvaluation(eval_, ["scripts/run.py"]);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects unknown resource paths", () => {
    const eval_: SkillResourceEvaluation = {
      resourcePath: "unknown/file.py",
      status: "complete",
      riskLevel: "none",
      readiness: "ready",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: [],
      purposeAlignment: { matches: true, rationale: "OK" },
      analyzedChunks: 0,
      totalChunks: 0,
      referenceIds: [],
    };
    const result = validateResourceEvaluation(eval_, ["scripts/run.py"]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "unknown-resource-path" }),
    );
  });

  it("drops findings with unregistered rule at resource level", () => {
    const finding = validFinding({ ruleId: "BOGUS-01", evidence: "chunk content" });
    const eval_: SkillResourceEvaluation = {
      resourcePath: "scripts/run.py",
      status: "complete",
      riskLevel: "medium",
      readiness: "ready",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: [finding],
      purposeAlignment: { matches: true, rationale: "OK" },
      analyzedChunks: 1,
      totalChunks: 1,
      referenceIds: [],
    };
    const result = validateResourceEvaluation(eval_, ["scripts/run.py"], "chunk content");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "unregistered-rule" }),
    );
  });

  it("drops findings with fabricated evidence at resource level", () => {
    const finding = validFinding({ evidence: "not in resource" });
    const eval_: SkillResourceEvaluation = {
      resourcePath: "scripts/run.py",
      status: "complete",
      riskLevel: "medium",
      readiness: "ready",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: [finding],
      purposeAlignment: { matches: true, rationale: "OK" },
      analyzedChunks: 1,
      totalChunks: 1,
      referenceIds: [],
    };
    const result = validateResourceEvaluation(eval_, ["scripts/run.py"], "actual source");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "fabricated-evidence" }),
    );
  });

  it("drops findings with URL in recommendation at resource level", () => {
    const finding = validFinding({ recommendation: "See https://example.com/fix" });
    const eval_: SkillResourceEvaluation = {
      resourcePath: "scripts/run.py",
      status: "complete",
      riskLevel: "medium",
      readiness: "ready",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: [finding],
      purposeAlignment: { matches: true, rationale: "OK" },
      analyzedChunks: 1,
      totalChunks: 1,
      referenceIds: [],
    };
    const result = validateResourceEvaluation(eval_, ["scripts/run.py"], "actual source");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-remediation" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Deep bundle evaluation validation
// ---------------------------------------------------------------------------

describe("validateDeepBundleEvaluation", () => {
  it("passes a valid deep bundle evaluation", () => {
    const eval_: DeepSkillBundleEvaluation = {
      status: "complete",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Good bundle.",
      referenceIds: [],
    };
    const result = validateDeepBundleEvaluation(eval_, []);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects invalid synthesis level", () => {
    const eval_ = {
      status: "complete",
      synthesisLevel: "INVALID" as never,
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Good.",
      referenceIds: [],
    };
    const result = validateDeepBundleEvaluation(eval_ as DeepSkillBundleEvaluation, []);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-synthesis-level" }),
    );
  });

  it("drops findings with unregistered rule at bundle level", () => {
    const finding = validFinding({ ruleId: "FAKE-BUNDLE-01", evidence: "bundle evidence" });
    const eval_: DeepSkillBundleEvaluation = {
      status: "complete",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [finding],
      operationalAssumptions: [],
      summary: "Summary.",
      referenceIds: [],
    };
    const result = validateDeepBundleEvaluation(eval_, [], "bundle evidence");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "unregistered-rule" }),
    );
  });

  it("drops findings with fabricated evidence at bundle level", () => {
    const finding = validFinding({ evidence: "invented text" });
    const eval_: DeepSkillBundleEvaluation = {
      status: "complete",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [finding],
      operationalAssumptions: [],
      summary: "Summary.",
      referenceIds: [],
    };
    const result = validateDeepBundleEvaluation(eval_, [], "real content only");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "fabricated-evidence" }),
    );
  });

  it("drops findings with URL in fixSteps at bundle level", () => {
    const finding = validFinding({
      fixSteps: [{ order: 1, action: "Visit https://malicious.io/payload" }],
    });
    const eval_: DeepSkillBundleEvaluation = {
      status: "complete",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [finding],
      operationalAssumptions: [],
      summary: "Summary.",
      referenceIds: [],
    };
    const result = validateDeepBundleEvaluation(eval_, [], "actual source");
    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "url-in-remediation" }),
    );
  });

  it("drops bundle findings already supplied by the deterministic scanner", () => {
    const deterministicFinding = validFinding();
    const eval_: DeepSkillBundleEvaluation = {
      status: "complete",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [{ ...deterministicFinding, ai: true }],
      operationalAssumptions: [],
      summary: "Summary.",
      referenceIds: ["cwe-78", "owasp-command-injection"],
    };

    const result = validateDeepBundleEvaluation(
      eval_,
      [],
      "actual source",
      [deterministicFinding],
    );

    expect(result.evaluation.findings).toHaveLength(0);
    expect(result.evaluation.referenceIds).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "duplicate-deterministic-finding" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-skill orchestration (P2-O)
// ---------------------------------------------------------------------------

describe("validateOrchestrationEvaluation", () => {
  const CORPUS = "alpha does thing A\n\nbeta does thing A as well";
  const SKILLS = ["alpha", "beta"];

  const evaluation = (
    over: Partial<CrossSkillOrchestrationEvaluation> = {},
  ): CrossSkillOrchestrationEvaluation =>
    ({
      status: "complete",
      summary: "two skills overlap",
      findings: [
        {
          id: "XSK-01:alpha+beta",
          ruleId: "XSK-01",
          severity: "high",
          skills: ["alpha", "beta"],
          evidence: "beta does thing A as well",
          referenceIds: ["ms-skills-overview"],
        },
      ],
      ...over,
    }) as CrossSkillOrchestrationEvaluation;

  it("keeps a well-formed finding", () => {
    const r = validateOrchestrationEvaluation(evaluation(), SKILLS, CORPUS);
    expect(r.evaluation.findings).toHaveLength(1);
    expect(r.issues).toHaveLength(0);
  });

  // The workflow agent omits `status` on every observed run: custom structured
  // output does not enforce `required`. Treating that as invalid downgraded a
  // complete evaluation to "partial" and logged an issue on every review.
  it("defaults an omitted status to complete without raising an issue", () => {
    const withoutStatus = evaluation();
    delete (withoutStatus as { status?: unknown }).status;

    const r = validateOrchestrationEvaluation(withoutStatus, SKILLS, CORPUS);

    expect(r.evaluation.status).toBe("complete");
    expect(r.issues).toHaveLength(0);
    expect(r.evaluation.findings).toHaveLength(1);
  });

  // Absent and wrong are different: a wrong value means the model answered the
  // question incorrectly rather than not answering it.
  it("still rejects a status that is present but not a legal value", () => {
    const r = validateOrchestrationEvaluation(
      evaluation({ status: "done" as CrossSkillOrchestrationEvaluation["status"] }),
      SKILLS,
      CORPUS,
    );
    expect(r.issues.some((i) => i.code === "invalid-status")).toBe(true);
    expect(r.evaluation.status).toBe("partial");
  });

  it("honours an explicit partial status", () => {
    const r = validateOrchestrationEvaluation(
      evaluation({ status: "partial" }),
      SKILLS,
      CORPUS,
    );
    expect(r.evaluation.status).toBe("partial");
    expect(r.issues).toHaveLength(0);
  });
});
