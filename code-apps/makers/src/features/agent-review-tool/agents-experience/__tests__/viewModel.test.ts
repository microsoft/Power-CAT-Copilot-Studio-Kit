import { describe, expect, it } from "vitest";
import type { AgentsExperienceModel, AeSkill } from "../contracts/AgentsExperienceModel";
import type { GroundedFinding } from "../contracts/Findings";
import type { ReferenceId } from "../contracts/references";
import type { AgentsExperienceReviewPayload } from "../../contracts/ReviewResult";
import type { SkillBundleReviewResult } from "../contracts/SkillBundle";
import type { SkillBundleEvaluation } from "../contracts/SkillEvaluation";
import { buildPersistedSkillView, buildReviewViewModel } from "../components/viewModel";
import { findingToView } from "../components/viewMappers";
import { copilotPayloadWithResourceFinding } from "./skillTestFixtures";
import {
  buildPersistedCopilotReview,
  buildPersistedSkillBundleReview,
} from "../services/skill/persistedSkillReview";
import { bundle, copilotPayloadWithDeepReviewFixture } from "./skillTestFixtures";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

const minimalModel: AgentsExperienceModel = {
  agentSettings: { instructions: "test", raw: {} },
  tools: [],
  skills: [],
  connectedAgents: [],
  knowledge: [],
  evaluationSets: [],
  testCases: [],
  multiTurnCases: [],
  triggers: [],
  unknownKinds: [],
};

function makeSkill(over: Partial<AeSkill> = {}): AeSkill {
  return {
    name: "brainstorming",
    schemaname: "agent.skill.brainstorming",
    markdown: "# Brainstorming",
    body: "Body",
    componentId: "comp-1",
    componentIdUnique: "compu-1",
    source: "inline-markdown",
    resourceCount: 0,
    ...over,
  };
}

function makeFinding(referenceId: ReferenceId): GroundedFinding {
  return {
    id: `test-${referenceId}`,
    family: "Test",
    severity: "error",
    title: "Test finding",
    fact: "test fact",
    why: "test why",
    fix: "test fix",
    referenceId,
    ai: false,
  };
}

function makePayload(findings: GroundedFinding[]): AgentsExperienceReviewPayload {
  return {
    model: minimalModel,
    findings,
    skillEvaluations: [],
    coverage: [],
    score: { grounded: 100, passed: findings.length, warnings: 0, errors: 0, evaluated: findings.length },
  };
}

// ---------------------------------------------------------------------------
// refCounts cascade tests
// ---------------------------------------------------------------------------

describe("buildReviewViewModel - refCounts", () => {
  it("counts MITRE CWE references separately from Anthropic", () => {
    const vm = buildReviewViewModel(
      makePayload([
        makeFinding("cwe-78"),          // MITRE CWE
        makeFinding("cwe-79"),          // MITRE CWE
        makeFinding("anthropic-agents"), // Anthropic
        makeFinding("owasp-llm01"),      // OWASP
        makeFinding("ms-skills-create"), // Microsoft Learn
      ]),
      "tester",
      1000,
      "TestAgent",
    );

    const { refCounts } = vm.summary;
    expect(refCounts.mitreCwe).toBe(2);
    expect(refCounts.anthropic).toBe(1);
    expect(refCounts.owasp).toBe(1);
    expect(refCounts.learn).toBe(1);
  });

  it("leaves Anthropic count at zero when there are no Anthropic references", () => {
    const vm = buildReviewViewModel(
      makePayload([makeFinding("cwe-78"), makeFinding("cwe-79")]),
      "tester",
      500,
    );

    expect(vm.summary.refCounts.anthropic).toBe(0);
    expect(vm.summary.refCounts.mitreCwe).toBe(2);
  });

  it("initialises all four buckets to zero for an empty findings list", () => {
    const vm = buildReviewViewModel(makePayload([]), "tester", 0);
    const { refCounts } = vm.summary;
    expect(refCounts.learn).toBe(0);
    expect(refCounts.owasp).toBe(0);
    expect(refCounts.anthropic).toBe(0);
    expect(refCounts.mitreCwe).toBe(0);
  });
});

describe("buildPersistedSkillView - safety gate", () => {
  it("uses the blocking finding when an advisory appears first", () => {
    const advisory = {
      id: "INJ-01:skill-creator",
      ruleId: "INJ-01",
      family: "Skills",
      dimension: "safety",
      severity: "critical",
      title: "Visible role override",
      fact: "Synthetic advisory.",
      why: "Synthetic advisory.",
      fix: "Remove it.",
      referenceId: "owasp-llm01",
      ai: false,
      evidence: "Synthetic advisory.",
      recommendation: "Remove it.",
      fixSteps: [{ order: 1, action: "Remove it." }],
      referenceIds: ["owasp-llm01"],
      confidence: "high",
      safetyDisposition: "advisory",
    };
    const blocker = {
      ...advisory,
      id: "HID-03:skill-creator",
      ruleId: "HID-03",
      title: "Hidden instruction override",
      safetyDisposition: "blocking",
    };
    const persisted = buildPersistedSkillBundleReview(
      bundle(),
      {
        status: "complete",
        mode: "standard",
        skillName: "skill-creator",
        skillSchemaName: "agent.skill.skill-creator",
        deterministicFindings: [advisory, blocker] as never,
        blocked: true,
      },
      "2026-09-24T00:00:00.000Z",
      "2026-09-24T00:00:01.000Z",
    );

    const view = buildPersistedSkillView(persisted);

    expect(view.safetyFlagged).toBe(true);
    expect(view.safetyFindingId).toBe("HID-03:skill-creator");
    expect(view.safetyDisposition).toBe("blocking");
  });
});

// ---------------------------------------------------------------------------
// fixSteps and references mapping
// ---------------------------------------------------------------------------

describe("buildReviewViewModel - fixSteps and references", () => {
  it("maps AI, automated, and missing legacy provenance without guessing", () => {
    const ai = findingToView({ ...makeFinding("ms-skills-overview"), ai: true });
    const skl05 = findingToView({
      ...makeFinding("owasp-llm01"),
      id: "SKL-05",
      ai: false,
    });
    const legacy = makeFinding("ms-skills-overview");
    Reflect.deleteProperty(legacy, "ai");

    expect(ai).toMatchObject({ provenance: "ai-generated", how: "AI-generated" });
    expect(skl05).toMatchObject({ provenance: "deterministic", how: "Automated check" });
    expect(findingToView(legacy)).toMatchObject({
      provenance: "unknown",
      how: "Source unavailable",
    });
  });

  it("labels advisory platform-overlap findings without presenting them as blockers", () => {
    const finding = {
      id: "INJ-01:meeting-notes-formatter",
      ruleId: "INJ-01",
      family: "Skills",
      severity: "critical" as const,
      title: "Visible role override",
      fact: "ignore previous instructions",
      why: "Prepublish authoring hygiene.",
      fix: "Remove the directive.",
      referenceId: "owasp-llm01" as const,
      ai: false,
      evidence: "ignore previous instructions",
      recommendation: "Remove the directive.",
      fixSteps: [],
      referenceIds: ["owasp-llm01" as const],
      confidence: "high" as const,
      safetyDisposition: "advisory" as const,
      platformOverlap: "observed" as const,
      skipAiEvaluation: true,
    };

    const view = findingToView(finding);
    expect(view.sev).toBe("warning");
    expect(view.safetyDisposition).toBe("advisory");
    expect(view.dispositionLabel).toBe("Prepublish advisory — platform runtime overlap observed");
  });

  it("labels unverified advisory findings without calling them blockers", () => {
    const finding = {
      id: "AGN-05:meeting-notes-formatter",
      ruleId: "AGN-05",
      family: "Skills",
      severity: "medium" as const,
      title: "Unrestricted tool use",
      fact: "run any command",
      why: "Platform coverage has not been validated.",
      fix: "Constrain the permitted commands.",
      referenceId: "owasp-llm06" as const,
      ai: false,
      evidence: "run any command",
      recommendation: "Constrain the permitted commands.",
      fixSteps: [],
      referenceIds: ["owasp-llm06" as const],
      confidence: "medium" as const,
      safetyDisposition: "advisory" as const,
      platformOverlap: "unverified" as const,
      skipAiEvaluation: false,
    };

    const view = findingToView(finding);
    expect(view.sev).toBe("warning");
    expect(view.dispositionLabel).toBe("Prepublish advisory — platform coverage unverified");
  });

  it("maps official fix steps and multiple references from a skill finding", () => {
    const vm = buildReviewViewModel(
      copilotPayloadWithResourceFinding({
        ruleId: "SCR-CMD-01",
        referenceIds: ["cwe-78", "owasp-command-injection"],
        fixSteps: [{ order: 1, action: "Use a fixed executable and argument array." }],
      }),
      "User",
      1000,
      "Agent",
    );
    expect(vm.findings[0].fixSteps).toEqual([
      { order: 1, action: expect.any(String) },
    ]);
    expect(vm.findings[0].references[0].source).toBe("MITRE CWE");
  });

  it("returns empty fixSteps for a plain grounded finding", () => {
    const vm = buildReviewViewModel(
      makePayload([makeFinding("cwe-78")]),
      "tester",
      0,
    );
    expect(vm.findings[0].fixSteps).toEqual([]);
    expect(vm.findings[0].references).toHaveLength(1);
    expect(vm.findings[0].references[0].source).toBe("MITRE CWE");
  });

  it("orders primary reference first when multiple referenceIds are present", () => {
    const vm = buildReviewViewModel(
      copilotPayloadWithResourceFinding({
        ruleId: "SCR-CMD-01",
        referenceIds: ["cwe-78", "owasp-command-injection"],
        fixSteps: [],
      }),
      "tester",
      0,
    );
    expect(vm.findings[0].references[0].id).toBe("cwe-78");
    expect(vm.findings[0].references[1].id).toBe("owasp-command-injection");
  });

  it("retains full https:// URL in mapped references and excludes unknown referenceIds", () => {
    const vm = buildReviewViewModel(
      copilotPayloadWithResourceFinding({
        ruleId: "SCR-CMD-01",
        // "unknown-ref-xyz" is not in REFERENCES; both known ids should be kept intact
        referenceIds: ["cwe-78", "owasp-command-injection", "unknown-ref-xyz" as never],
        fixSteps: [],
      }),
      "tester",
      0,
    );
    const refs = vm.findings[0].references;
    // Unknown id must be excluded
    expect(refs).toHaveLength(2);
    // Every mapped URL must be an absolute https:// URL (no double-protocol)
    for (const ref of refs) {
      expect(ref.url).toMatch(/^https:\/\/[^/]/);
      expect(ref.url).not.toMatch(/^https:\/\/https?:\/\//);
    }
  });
});

// ---------------------------------------------------------------------------
// reviewCoverage model contract
// ---------------------------------------------------------------------------

describe("buildReviewViewModel - reviewCoverage", () => {
  it("maps reviewCoverage as a descriptive label without a percent suffix", () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepReviewFixture());
    const vm = buildReviewViewModel(persisted.payload, "tester", 0);
    for (const skill of vm.skills) {
      if (skill.resourceRows) {
        for (const row of skill.resourceRows) {
          expect(row.reviewCoverage).not.toMatch(/%/);
          expect(row.reviewCoverage).toBeTruthy();
        }
      }
    }
  });

  it("recalculates a legacy persisted quality card from normalized dimensions", () => {
    const skill = makeSkill();
    const dimensions = [
      { key: "Clarity" as const, score: 68, rationale: "" },
      { key: "Actionability" as const, score: 30, rationale: "" },
      { key: "Scope discipline" as const, score: 88, rationale: "" },
      { key: "Composability" as const, score: 45, rationale: "" },
    ];
    const persisted = buildPersistedCopilotReview({
      payload: {
        ...payloadWithSkill({ skill }),
        skillBundleReviews: [{
          status: "complete",
          mode: "standard",
          skillName: skill.name,
          skillSchemaName: skill.schemaname,
          deterministicFindings: [],
          blocked: false,
          standardEvaluation: {
            status: "complete",
            dimensions,
            findings: [],
            resourcePurposeAlignment: [],
            operationalAssumptions: [],
            unreviewedResources: [],
            summary: "",
            referenceIds: [],
          },
        }],
      },
      bundles: [{
        skillComponentId: skill.componentId,
        skillComponentUniqueId: skill.componentIdUnique,
        skillSchemaName: skill.schemaname,
        skillName: skill.name,
        source: "inline-markdown",
        skillMarkdown: skill.markdown,
        skillMarkdownHash: "hash",
        agentInstructions: "",
        siblingDescriptions: [],
        manifest: [],
        resources: [],
        retrievalIssues: [],
        bundleHash: "hash",
      }],
      mode: "standard",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
    });
    const review = persisted.payload.skillBundleReviews[0];
    // Reproduce the stale card value written before legacy normalization.
    review.scores.quality.value = 100;

    const vm = buildReviewViewModel(persisted.payload, "tester", 0);

    expect(vm.skills[0].scores?.quality.value).toBe(58);
  });
});

// ---------------------------------------------------------------------------
// Task 2 — canonical skill evaluation states (no synthetic "Deterministic scan")
// ---------------------------------------------------------------------------

function payloadWithSkill(over: {
  skill?: Partial<AeSkill>;
  skillBundleReviews?: SkillBundleReviewResult[];
  skillEvaluations?: SkillBundleEvaluation[];
}): AgentsExperienceReviewPayload {
  const skill = makeSkill(over.skill);
  return {
    model: { ...minimalModel, skills: [skill] },
    findings: [],
    skillEvaluations: over.skillEvaluations ?? [],
    skillBundleReviews: over.skillBundleReviews ?? [],
    coverage: [],
    score: { grounded: 100, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
  };
}

const DIMENSIONS = [
  { key: "Clarity" as const, score: 8, rationale: "clear" },
  { key: "Actionability" as const, score: 6, rationale: "actionable" },
  { key: "Scope discipline" as const, score: 9, rationale: "scoped" },
  { key: "Composability" as const, score: 7, rationale: "composable" },
];

describe("buildReviewViewModel - skill evaluation state (Task 2)", () => {
  it("never produces a 'Deterministic scan' synthetic dimension", () => {
    const payload = payloadWithSkill({});
    const vm = buildReviewViewModel(payload, "tester", 0);
    for (const skill of vm.skills) {
      expect(skill.dimensions.some(d => d.key === "Deterministic scan")).toBe(false);
    }
  });

  it("maps a skill with no bundle review or legacy evaluation to 'unavailable' with an empty dimension list", () => {
    const payload = payloadWithSkill({});
    const vm = buildReviewViewModel(payload, "tester", 0);
    expect(vm.skills[0].evaluationState).toBe("unavailable");
    expect(vm.skills[0].dimensions).toEqual([]);
  });

  it("prefers persisted standard.dimensions over everything else", () => {
    const skill = makeSkill();
    const persisted = buildPersistedCopilotReview({
      payload: {
        ...payloadWithSkill({ skill }),
        skillBundleReviews: [{
          status: "complete",
          mode: "standard",
          skillName: skill.name,
          skillSchemaName: skill.schemaname,
          deterministicFindings: [],
          blocked: false,
          standardEvaluation: {
            status: "complete",
            dimensions: DIMENSIONS,
            findings: [],
            resourcePurposeAlignment: [],
            operationalAssumptions: [],
            unreviewedResources: [],
            summary: "",
            referenceIds: [],
          },
        }],
      },
      bundles: [{
        skillComponentId: skill.componentId,
        skillComponentUniqueId: skill.componentIdUnique,
        skillSchemaName: skill.schemaname,
        skillName: skill.name,
        source: "inline-markdown",
        skillMarkdown: skill.markdown,
        skillMarkdownHash: "hash",
        agentInstructions: "",
        siblingDescriptions: [],
        manifest: [],
        resources: [],
        retrievalIssues: [],
        bundleHash: "hash",
      }],
      mode: "standard",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
    });
    const vm = buildReviewViewModel(persisted.payload, "tester", 0);
    expect(vm.skills[0].evaluationState).toBe("evaluated");
    expect(vm.skills[0].dimensions).toEqual(
      DIMENSIONS.map(d => ({ key: d.key, score: d.score, rationale: d.rationale })),
    );
  });

  it("falls back to runtime standardEvaluation.dimensions when no persisted review is present", () => {
    const skill = makeSkill();
    const review: SkillBundleReviewResult = {
      status: "complete",
      mode: "standard",
      skillName: skill.name,
      skillSchemaName: skill.schemaname,
      deterministicFindings: [],
      blocked: false,
      standardEvaluation: {
        status: "complete",
        dimensions: DIMENSIONS,
        findings: [],
        resourcePurposeAlignment: [],
        operationalAssumptions: [],
        unreviewedResources: [],
        summary: "",
        referenceIds: [],
      },
    };
    const payload = payloadWithSkill({ skill, skillBundleReviews: [review] });
    const vm = buildReviewViewModel(payload, "tester", 0);
    expect(vm.skills[0].evaluationState).toBe("evaluated");
    expect(vm.skills[0].dimensions.map(d => d.key)).toEqual(DIMENSIONS.map(d => d.key));
  });

  it("falls back to legacy skillEvaluations only when no canonical bundle review exists", () => {
    const skill = makeSkill({ frontmatterName: "brainstorming" });
    const legacy: SkillBundleEvaluation = {
      name: "brainstorming",
      descriptionPresent: true, descriptionStatesWhen: true, descriptionRationale: "",
      dimensions: DIMENSIONS, overallScorePercent: 75, band: "Good",
      sizeLabel: "1 KB", structureOk: true,
      safety: { flagged: false, severity: "none", findings: [] },
      resources: [], bundleIntegrity: {
        referencedButMissing: [], presentButUnreferenced: [], progressiveDisclosureOk: true, rationale: "",
      },
      crossSkillConflicts: [], citations: [], summary: "",
    };
    const payload = payloadWithSkill({ skill, skillEvaluations: [legacy] });
    const vm = buildReviewViewModel(payload, "tester", 0);
    expect(vm.skills[0].evaluationState).toBe("evaluated");
    expect(vm.skills[0].dimensions.map(d => d.key)).toEqual(DIMENSIONS.map(d => d.key));
  });

  it("maps blocked/unavailable/failed/cancelled bundle-review statuses to the matching truthful state", () => {
    const statuses: Array<SkillBundleReviewResult["status"]> = [
      "blocked", "unavailable", "failed", "cancelled", "partial",
    ];
    for (const status of statuses) {
      const skill = makeSkill();
      const review: SkillBundleReviewResult = {
        status, mode: "standard", skillName: skill.name, skillSchemaName: skill.schemaname,
        deterministicFindings: [], blocked: status === "blocked",
      };
      const payload = payloadWithSkill({ skill, skillBundleReviews: [review] });
      const vm = buildReviewViewModel(payload, "tester", 0);
      const expected = status === "complete" ? "evaluated" : status;
      expect(vm.skills[0].evaluationState).toBe(expected);
      // No real dimensions were produced for any of these non-evaluated states,
      // so the skill must never carry a synthetic grade.
      expect(vm.skills[0].dimensions).toEqual([]);
    }
  });

  it("resolves a skill by schema identity so duplicate display names cannot cross-contaminate grades", () => {
    const skillA = makeSkill({ name: "dup", schemaname: "agent.skill.dup-a", componentIdUnique: "a" });
    const skillB = makeSkill({ name: "dup", schemaname: "agent.skill.dup-b", componentIdUnique: "b" });
    const reviewA: SkillBundleReviewResult = {
      status: "complete", mode: "standard", skillName: "dup", skillSchemaName: "agent.skill.dup-a",
      deterministicFindings: [], blocked: false,
      standardEvaluation: {
        status: "complete", dimensions: DIMENSIONS, findings: [], resourcePurposeAlignment: [],
        operationalAssumptions: [], unreviewedResources: [], summary: "", referenceIds: [],
      },
    };
    const reviewB: SkillBundleReviewResult = {
      status: "unavailable", mode: "standard", skillName: "dup", skillSchemaName: "agent.skill.dup-b",
      deterministicFindings: [], blocked: false,
    };
    const payload: AgentsExperienceReviewPayload = {
      model: { ...minimalModel, skills: [skillA, skillB] },
      findings: [],
      skillEvaluations: [],
      skillBundleReviews: [reviewA, reviewB],
      coverage: [],
      score: { grounded: 100, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
    };
    const vm = buildReviewViewModel(payload, "tester", 0);
    expect(vm.skills[0].id).toBe("a");
    expect(vm.skills[0].schemaName).toBe("agent.skill.dup-a");
    expect(vm.skills[1].id).toBe("b");
    expect(vm.skills[0].evaluationState).toBe("evaluated");
    expect(vm.skills[0].dimensions.length).toBeGreaterThan(0);
    expect(vm.skills[1].evaluationState).toBe("unavailable");
    expect(vm.skills[1].dimensions).toEqual([]);
  });

  it("handles zero skills without dividing by zero", () => {
    const payload: AgentsExperienceReviewPayload = {
      model: minimalModel,
      findings: [], skillEvaluations: [], skillBundleReviews: [], coverage: [],
      score: { grounded: 100, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
    };
    const vm = buildReviewViewModel(payload, "tester", 0);
    expect(vm.skills).toEqual([]);
  });
});
