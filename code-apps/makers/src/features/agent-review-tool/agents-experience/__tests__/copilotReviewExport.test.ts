import { describe, expect, it } from "vitest";
import {
  buildCopilotSkillExportRows,
  buildFindingExportRows,
  buildSkillGradeExportRows,
  scoreBasisLabel,
  instructionCoverageExportLabel,
} from "../utils/copilotReviewExport";
import {
  copilotPayloadWithDeepReviewFixture,
  buildPersistedPayloadForFindingExport,
} from "./skillTestFixtures";
import type { GroundedFinding, GroundedSkillFinding } from "../contracts/Findings";
import type { ReviewViewModel, SkillView } from "../components/viewTypes";

describe("buildCopilotSkillExportRows", () => {
  it("exports resource metadata and findings without source content", () => {
    const rows = buildCopilotSkillExportRows(copilotPayloadWithDeepReviewFixture());
    expect(JSON.stringify(rows)).not.toContain("textContent");
    expect(rows.some((row) => row.resourcePath === "scripts/run.py")).toBe(true);
  });

  it("includes sizeBytes and analysisStatus per resource row", () => {
    const rows = buildCopilotSkillExportRows(copilotPayloadWithDeepReviewFixture());
    const row = rows.find((r) => r.resourcePath === "scripts/run.py");
    expect(row).toBeDefined();
    expect(typeof row!.sizeBytes).toBe("number");
    expect(row!.analysisStatus).toBe("completed");
  });

  it("includes skillName in each row", () => {
    const rows = buildCopilotSkillExportRows(copilotPayloadWithDeepReviewFixture());
    for (const row of rows) {
      expect(typeof row.skillName).toBe("string");
      expect(row.skillName.length).toBeGreaterThan(0);
    }
  });

  it("does not include sha256 or chunks in export rows", () => {
    const rows = buildCopilotSkillExportRows(copilotPayloadWithDeepReviewFixture());
    const json = JSON.stringify(rows);
    expect(json).not.toContain('"sha256"');
    expect(json).not.toContain('"chunks"');
  });
});

// ---------------------------------------------------------------------------
// buildFindingExportRows — Task 12 review-fix tests
// ---------------------------------------------------------------------------

describe("buildFindingExportRows", () => {
  it("redacts secrets in all three narrative fields (fact, why, fix)", () => {
    const secret = 'api_key = "sk-supersecret-12345" in config';
    const finding: GroundedFinding = {
      id: "SEC-01", family: "Security", severity: "error",
      title: "Secret exposure", ai: false,
      fact: secret, why: secret, fix: secret,
      referenceId: "ms-agents-overview",
    };
    const payload = buildPersistedPayloadForFindingExport({ topLevelFindings: [finding] });
    const rows = buildFindingExportRows(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0].fact).not.toContain(secret);
    expect(rows[0].why).not.toContain(secret);
    expect(rows[0].fix).not.toContain(secret);
  });

  it("includes non-skill top-level findings not attributed to any skill bundle", () => {
    const nonSkill: GroundedFinding = {
      id: "AGT-01", family: "Agent", severity: "warning",
      title: "Non-skill finding", ai: false,
      fact: "fact", why: "why", fix: "fix",
      referenceId: "ms-agents-overview",
    };
    const payload = buildPersistedPayloadForFindingExport({
      topLevelFindings: [nonSkill],
      skillBundleFindings: [],
    });
    const rows = buildFindingExportRows(payload);
    expect(rows.some(r => r.findingId === "AGT-01")).toBe(true);
    expect(rows.find(r => r.findingId === "AGT-01")?.skillName).toBe("—");
  });

  it("deduplicates findings present in both top-level and bundle projections", () => {
    const skillFinding: GroundedSkillFinding = {
      id: "DUP-01", family: "Skills", severity: "medium",
      title: "Duplicate finding", ai: false,
      fact: "fact", why: "why", fix: "fix",
      referenceId: "ms-skills-overview",
      ruleId: "DUP-01", evidence: "evidence", recommendation: "fix it",
      fixSteps: [], referenceIds: ["ms-skills-overview"], confidence: "high",
    };
    const payload = buildPersistedPayloadForFindingExport({
      topLevelFindings: [skillFinding],
      skillBundleFindings: [{ skillName: "my-skill", findings: [skillFinding] }],
    });
    const rows = buildFindingExportRows(payload);
    const dups = rows.filter(r => r.findingId === "DUP-01");
    expect(dups).toHaveLength(1);
    // Skill attribution is resolved from bundle review
    expect(dups[0].skillName).toBe("my-skill");
  });

  it("includes skill attribution for skill findings from bundle reviews", () => {
    const sf: GroundedSkillFinding = {
      id: "BND-01", family: "Skills", severity: "high",
      title: "Skill finding", ai: false,
      fact: "fact", why: "why", fix: "fix",
      referenceId: "ms-skills-overview",
      ruleId: "BND-01", evidence: "evidence", recommendation: "fix it",
      fixSteps: [], referenceIds: ["ms-skills-overview"], confidence: "high",
    };
    const payload = buildPersistedPayloadForFindingExport({
      topLevelFindings: [sf],
      skillBundleFindings: [{ skillName: "my-bundle-skill", findings: [sf] }],
    });
    const rows = buildFindingExportRows(payload);
    expect(rows[0].skillName).toBe("my-bundle-skill");
    expect(rows[0].ruleId).toBe("BND-01");
  });

  it("exports the product disposition separately from technical severity", () => {
    const sf: GroundedSkillFinding = {
      id: "INJ-01:meeting-notes-formatter", family: "Skills", severity: "critical",
      title: "Visible role override", ai: false,
      fact: "ignore previous instructions", why: "Prepublish hygiene", fix: "Remove it",
      referenceId: "owasp-llm01",
      ruleId: "INJ-01", evidence: "ignore previous instructions", recommendation: "Remove it",
      fixSteps: [], referenceIds: ["owasp-llm01"], confidence: "high",
      safetyDisposition: "advisory",
      platformOverlap: "observed",
      skipAiEvaluation: true,
    };
    const payload = buildPersistedPayloadForFindingExport({
      topLevelFindings: [sf],
      skillBundleFindings: [{ skillName: "meeting-notes-formatter", findings: [sf] }],
    });

    const rows = buildFindingExportRows(payload);
    expect(rows[0].safetyDisposition).toBe("advisory");
    expect(rows[0].dispositionLabel).toBe("Prepublish advisory — platform runtime overlap observed");
  });
});

// ---------------------------------------------------------------------------
// Task 5 — truthful skill grade / score-basis / instruction-coverage export
// ---------------------------------------------------------------------------

function makeSkillView(over: Partial<SkillView>): SkillView {
  return {
    name: "test-skill", description: "d", source: "inline",
    safetyFlagged: false, sizeLabel: "1 KB", dimensions: [],
    evaluationState: "unavailable", markdown: "",
    ...over,
  };
}

function makeVm(skills: SkillView[]): ReviewViewModel {
  return {
    summary: {
      agentName: "A", score: 80, passed: 1, warnings: 0, errors: 0, rulesEvaluated: 1,
      model: "Default", memoryEnabled: false, webSearchEnabled: false, duration: "00:01",
      reviewedBy: "tester", refCounts: { learn: 0, owasp: 0, anthropic: 0, mitreCwe: 0 },
      capabilitiesCovered: 0, capabilitiesTotal: 0, testCases: 0, multiTurnCases: 0,
      graders: "none", evaluationSets: 0,
    },
    findings: [], coverage: [], coverageBasis: "inferred", coverageSets: [],
    skills, skillsGrouped: { groups: [], orchestration: [], skillsByName: {} },
    capabilityChips: [],
  };
}

describe("buildSkillGradeExportRows", () => {
  it("exports 'Not evaluated' for an unavailable skill grade — never a synthetic 0%", () => {
    const rows = buildSkillGradeExportRows(makeVm([makeSkillView({ evaluationState: "unavailable" })]));
    expect(rows[0].grade).toBe("Not evaluated");
    expect(rows[0].grade).not.toContain("0%");
  });

  it("exports 'AI evaluation withheld' for a blocked skill", () => {
    const rows = buildSkillGradeExportRows(makeVm([makeSkillView({ evaluationState: "blocked" })]));
    expect(rows[0].grade).toBe("AI evaluation withheld");
  });

  it("exports 'Evaluation failed' for a failed skill — never '0%'", () => {
    const rows = buildSkillGradeExportRows(makeVm([makeSkillView({ evaluationState: "failed" })]));
    expect(rows[0].grade).toBe("Evaluation failed");
    expect(rows[0].grade).not.toContain("0%");
  });

  it("exports the real percentage annotated '(Partial)' for a partial evaluation", () => {
    const rows = buildSkillGradeExportRows(makeVm([makeSkillView({
      evaluationState: "partial",
      dimensions: [{ key: "Clarity", score: 8, rationale: "" }, { key: "Actionability", score: 6, rationale: "" }],
    })]));
    expect(rows[0].grade).toBe("70% (Partial)");
  });

  it("exports a genuine evaluator result of 0 as a real percentage, not 'Not evaluated'", () => {
    const rows = buildSkillGradeExportRows(makeVm([makeSkillView({
      evaluationState: "evaluated",
      dimensions: [{ key: "Clarity", score: 0, rationale: "" }],
    })]));
    expect(rows[0].grade).toContain("0%");
    expect(rows[0].grade).not.toBe("Not evaluated");
  });
});

describe("scoreBasisLabel", () => {
  it("labels a legacy (pre-v2) score without claiming v2 provenance", () => {
    expect(scoreBasisLabel({})).toContain("Legacy score");
  });

  it("labels a complete v2 score", () => {
    expect(scoreBasisLabel({ basisVersion: 2, status: "complete" })).toBe("Grounded configuration score (v2)");
  });

  it("labels a partial v2 score", () => {
    expect(scoreBasisLabel({ basisVersion: 2, status: "partial" })).toContain("Partial");
  });
});

describe("instructionCoverageExportLabel", () => {
  it("discloses 'Unknown (legacy review)' when no status was recorded", () => {
    expect(instructionCoverageExportLabel(undefined)).toBe("Unknown (legacy review)");
  });

  it("discloses unavailable, failed, and partial instruction-coverage states truthfully", () => {
    expect(instructionCoverageExportLabel({ state: "unavailable", reason: "unprovisioned" })).toContain("Not evaluated");
    expect(instructionCoverageExportLabel({ state: "failed", reason: "invocation-failed" })).toBe("Failed");
    expect(instructionCoverageExportLabel({ state: "partial", reason: "incomplete-response" })).toBe("Partial");
  });
});
