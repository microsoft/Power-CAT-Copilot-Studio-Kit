/**
 * Validators for AI-returned skill evaluation structured outputs.
 *
 * Each validator enforces the strict contract: registered rule IDs, approved
 * reference IDs, required explanation fields, evidence grounding in submitted
 * source, exact enums, dimension completeness, and URL-free remediation text.
 * Invalid findings are dropped with issues rather than displayed.
 * No broad catch or silent success fallback.
 */
import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type {
  StandardSkillBundleEvaluation,
  SkillDimension,
  CrossSkillOrchestrationEvaluation,
  CrossSkillOrchestrationFinding,
} from "../../contracts/SkillEvaluation.js";
import { getRule, validateRuleReferences } from "./skillRuleRegistry.js";
import {
  createOrchestrationFinding,
  getOrchestrationRule,
  validateOrchestrationRuleReferences,
} from "./orchestrationRuleRegistry.js";

// ---------------------------------------------------------------------------
// Validation issue contract
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string;
  message: string;
  findingId?: string;
}

// ---------------------------------------------------------------------------
// Standard evaluation result
// ---------------------------------------------------------------------------

export interface StandardValidationResult {
  evaluation: StandardSkillBundleEvaluation;
  issues: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Dimension constants
// ---------------------------------------------------------------------------

const REQUIRED_DIMENSIONS: SkillDimension["key"][] = [
  "Clarity",
  "Actionability",
  "Scope discipline",
  "Composability",
];
const STANDARD_QUALITY_REFERENCE_IDS = new Set([
  "ms-skills-create",
  "ms-skills-overview",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Matches http(s) URLs in text. */
const URL_PATTERN = /https?:\/\/[^\s"')<>\]]+/i;

/**
 * Returns true if the text contains an http(s) URL.
 * Model-supplied links must never persist in recommendation/why/fix text.
 */
export function containsUrl(text: string): boolean {
  return URL_PATTERN.test(text);
}

/**
 * Validates that evidence text is present in the submitted source content.
 * Uses case-insensitive substring matching.
 */
function evidenceIsGrounded(evidence: string, sourceContent: string): boolean {
  if (!evidence || !sourceContent) return false;
  return sourceContent.toLowerCase().includes(evidence.toLowerCase());
}

/**
 * Validates a single finding against the rule registry, evidence corpus,
 * and URL-free remediation requirement.
 * Returns the finding if valid, or null + issues if invalid.
 */
function validateSingleFinding(
  finding: GroundedSkillFinding,
  sourceContent: string,
): { valid: GroundedSkillFinding | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  // Check registered rule
  const rule = getRule(finding.ruleId);
  if (!rule) {
    issues.push({
      code: "unregistered-rule",
      message: `Rule "${finding.ruleId}" is not registered in the skill rule registry.`,
      findingId: finding.id,
    });
    return { valid: null, issues };
  }

  // Validate reference IDs
  if (
    !finding.referenceIds ||
    finding.referenceIds.length === 0 ||
    !validateRuleReferences(finding.ruleId, finding.referenceIds as string[])
  ) {
    issues.push({
      code: "invalid-references",
      message: `Finding "${finding.id}" references IDs not approved for rule "${finding.ruleId}".`,
      findingId: finding.id,
    });
    return { valid: null, issues };
  }

  // Validate required fields
  if (!finding.recommendation) {
    issues.push({
      code: "missing-recommendation",
      message: `Finding "${finding.id}" is missing a recommendation.`,
      findingId: finding.id,
    });
    return { valid: null, issues };
  }

  if (!finding.fixSteps || finding.fixSteps.length === 0) {
    issues.push({
      code: "missing-fix-steps",
      message: `Finding "${finding.id}" has no fix steps.`,
      findingId: finding.id,
    });
    return { valid: null, issues };
  }

  // Reject findings with model-supplied URLs in remediation text
  const textsToCheck = [
    finding.why,
    finding.recommendation,
    finding.fix,
    ...finding.fixSteps.map((s) => s.action),
  ].filter(Boolean);

  for (const text of textsToCheck) {
    if (containsUrl(text)) {
      issues.push({
        code: "url-in-remediation",
        message: `Finding "${finding.id}" contains a URL in remediation text which is not permitted.`,
        findingId: finding.id,
      });
      return { valid: null, issues };
    }
  }

  // Validate evidence grounding
  if (!evidenceIsGrounded(finding.evidence, sourceContent)) {
    issues.push({
      code: "fabricated-evidence",
      message: `Finding "${finding.id}" evidence not found in submitted source.`,
      findingId: finding.id,
    });
    return { valid: null, issues };
  }

  // Stamp the authoritative rubric dimension from the registered rule so that
  // grouped display never depends on model-supplied dimension values.
  return { valid: { ...finding, dimension: rule.dimension }, issues };
}

/**
 * Validates an array of findings against the rule registry and evidence corpus.
 * Used by all evaluation-level validators to enforce the same gate.
 */
function validateFindings(
  findings: GroundedSkillFinding[],
  sourceCorpus: string,
): { validFindings: GroundedSkillFinding[]; issues: ValidationIssue[] } {
  const validFindings: GroundedSkillFinding[] = [];
  const issues: ValidationIssue[] = [];

  for (const finding of findings) {
    const { valid, issues: findingIssues } = validateSingleFinding(finding, sourceCorpus);
    issues.push(...findingIssues);
    if (valid) {
      validFindings.push(valid);
    }
  }

  return { validFindings, issues };
}

function removeDeterministicDuplicateFindings(
  findings: GroundedSkillFinding[],
  deterministicFindings: readonly GroundedSkillFinding[],
  issues: ValidationIssue[],
): GroundedSkillFinding[] {
  const deterministicIds = new Set(
    deterministicFindings.map((finding) => finding.id),
  );
  const deterministicSignatures = new Set(
    deterministicFindings.map(
      (finding) =>
        `${finding.ruleId}\u0000${finding.resourcePath}\u0000${finding.evidence}`,
    ),
  );
  // Model-level rules (SKL-*, INS-*) are evaluated against the whole agent, so
  // their findings carry no resourcePath and no evidence quote. Neither the id
  // nor the signature can then match an AI finding for the same defect, which
  // is path-scoped and quoted. Treat the rule id alone as the identity in that
  // case: the scanner has already reported this rule for this bundle.
  const unscopedRuleIds = new Set(
    deterministicFindings
      .filter((finding) => !finding.resourcePath && !finding.evidence)
      .map((finding) => finding.ruleId),
  );

  return findings.filter((finding) => {
    const signature =
      `${finding.ruleId}\u0000${finding.resourcePath}\u0000${finding.evidence}`;
    const isDuplicate =
      deterministicIds.has(finding.id)
      || deterministicSignatures.has(signature)
      || unscopedRuleIds.has(finding.ruleId);
    if (isDuplicate) {
      issues.push({
        code: "duplicate-deterministic-finding",
        message: `Finding "${finding.id}" duplicates an authoritative deterministic finding.`,
        findingId: finding.id,
      });
    }
    return !isDuplicate;
  });
}

// ---------------------------------------------------------------------------
// Public API: Standard evaluation validation
// ---------------------------------------------------------------------------

/**
 * Validates a StandardSkillBundleEvaluation output.
 * Checks dimension completeness, score ranges, and finding validity.
 * Findings are validated through the same registered-rule/reference/remediation
 * gate as chunk findings, using the provided source corpus for evidence grounding.
 *
 * @param evaluation - The raw AI-returned standard evaluation.
 * @param sourceCorpus - The skill markdown + resource excerpts text for evidence grounding.
 * @param deterministicFindings - Authoritative scanner findings that AI output must not duplicate.
 */
export function validateStandardEvaluation(
  evaluation: StandardSkillBundleEvaluation,
  sourceCorpus: string = "",
  deterministicFindings: readonly GroundedSkillFinding[] = [],
): StandardValidationResult {
  const issues: ValidationIssue[] = [];

  // Validate dimensions count
  if (evaluation.dimensions.length !== 4) {
    issues.push({
      code: "missing-dimensions",
      message: `Expected exactly 4 dimensions, got ${evaluation.dimensions.length}.`,
    });
  }

  // Validate dimension keys (no duplicates, all required present)
  const seenKeys = new Set<string>();
  for (const dim of evaluation.dimensions) {
    if (seenKeys.has(dim.key)) {
      issues.push({
        code: "duplicate-dimension",
        message: `Duplicate dimension key "${dim.key}".`,
      });
    }
    seenKeys.add(dim.key);

    // Validate score range
    if (dim.score < 0 || dim.score > 10 || !Number.isFinite(dim.score)) {
      issues.push({
        code: "invalid-dimension-score",
        message: `Dimension "${dim.key}" score ${dim.score} is outside 0-10.`,
      });
    }
  }

  // Check all required dimensions present
  for (const required of REQUIRED_DIMENSIONS) {
    if (!seenKeys.has(required)) {
      issues.push({
        code: "missing-dimensions",
        message: `Required dimension "${required}" is missing.`,
      });
    }
  }

  // Validate status enum
  if (!["complete", "partial"].includes(evaluation.status)) {
    issues.push({
      code: "invalid-status",
      message: `Invalid status "${evaluation.status}".`,
    });
  }

  const deduplicatedFindings = removeDeterministicDuplicateFindings(
    evaluation.findings,
    deterministicFindings,
    issues,
  );

  // Validate findings through the registered-rule/reference/remediation gate
  const { validFindings, issues: findingIssues } = validateFindings(
    deduplicatedFindings,
    sourceCorpus,
  );
  issues.push(...findingIssues);

  const findingReferenceIds = new Set<string>(
    validFindings.flatMap((finding) => finding.referenceIds),
  );
  const qualityReferenceIds = evaluation.referenceIds.filter((referenceId) => {
    const isValid =
      STANDARD_QUALITY_REFERENCE_IDS.has(referenceId);
    const isFindingReference = findingReferenceIds.has(referenceId);
    if (!isValid && !isFindingReference) {
      issues.push({
        code: "invalid-top-level-reference",
        message: `Top-level reference "${referenceId}" is not used by a validated AI finding or approved quality assessment.`,
      });
    }
    return isValid;
  });

  return {
    evaluation: {
      ...evaluation,
      findings: validFindings,
      referenceIds: [
        ...new Set([...findingReferenceIds, ...qualityReferenceIds]),
      ],
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Cross-skill orchestration evaluation result
// ---------------------------------------------------------------------------

export interface OrchestrationValidationResult {
  evaluation: CrossSkillOrchestrationEvaluation;
  issues: ValidationIssue[];
}

/** Orchestration issue types that describe a relationship between >= 2 skills. */
const PAIRWISE_ORCHESTRATION_TYPES = new Set([
  "overlap",
  "redundancy",
  "contradiction",
  "coupling",
]);

// ---------------------------------------------------------------------------
// Public API: Cross-skill orchestration evaluation validation
// ---------------------------------------------------------------------------

/**
 * Validates a {@link CrossSkillOrchestrationEvaluation} output from the P2-O
 * prompt. Each finding must reference a registered XSK rule with approved
 * reference IDs, name at least one real skill, and carry evidence grounded in
 * the submitted skill corpus. Valid findings are rebuilt from the orchestration
 * rule registry so titles, rationale, recommendation, fix steps, and references
 * always come from the registry; only AI-supplied evidence and skill names are
 * retained. Invalid findings are dropped with issues.
 *
 * @param evaluation - The raw AI-returned orchestration evaluation.
 * @param knownSkills - Skill names present in the review (for skill validation).
 * @param sourceCorpus - Combined skill text for evidence grounding.
 */
export function validateOrchestrationEvaluation(
  evaluation: CrossSkillOrchestrationEvaluation,
  knownSkills: string[] = [],
  sourceCorpus: string = "",
): OrchestrationValidationResult {
  const issues: ValidationIssue[] = [];
  const knownSkillSet = new Set(knownSkills);

  // An omitted status is defaulted rather than reported.
  //
  // Custom structured output does not enforce `required`, and the orchestration
  // model omits `status` on every observed run (2026-08-05, three consecutive
  // runs) even when the instruction demands it as its closing line. Treating
  // that as invalid degraded a complete evaluation to "partial" and logged an
  // issue on every review. `toComponentResult` already makes the same choice for
  // per-component results (`candidate.status ?? "complete"`).
  //
  // A status that is present but not a legal value is still an error: that means
  // the model answered the question wrongly, rather than not answering it.
  const status = evaluation.status ?? "complete";
  if (!["complete", "partial"].includes(status)) {
    issues.push({
      code: "invalid-status",
      message: `Invalid status "${evaluation.status}".`,
    });
  }

  const rawFindings = Array.isArray(evaluation.findings) ? evaluation.findings : [];
  const validFindings: CrossSkillOrchestrationFinding[] = [];

  for (const finding of rawFindings) {
    const rule = getOrchestrationRule(finding.ruleId);
    if (!rule) {
      issues.push({
        code: "unregistered-orchestration-rule",
        message: `Orchestration rule "${finding.ruleId}" is not registered.`,
        findingId: finding.id,
      });
      continue;
    }

    const referenceIds = Array.isArray(finding.referenceIds) ? finding.referenceIds : [];
    if (
      referenceIds.length === 0 ||
      !validateOrchestrationRuleReferences(finding.ruleId, referenceIds)
    ) {
      issues.push({
        code: "invalid-references",
        message: `Orchestration finding "${finding.id}" references IDs not approved for rule "${finding.ruleId}".`,
        findingId: finding.id,
      });
      continue;
    }

    const skills = Array.isArray(finding.skills) ? finding.skills.filter(Boolean) : [];
    if (skills.length === 0) {
      issues.push({
        code: "missing-skills",
        message: `Orchestration finding "${finding.id}" names no skills.`,
        findingId: finding.id,
      });
      continue;
    }
    if (PAIRWISE_ORCHESTRATION_TYPES.has(rule.type) && skills.length < 2) {
      issues.push({
        code: "insufficient-skills",
        message: `Orchestration finding "${finding.id}" of type "${rule.type}" requires at least 2 skills.`,
        findingId: finding.id,
      });
      continue;
    }

    if (knownSkillSet.size > 0) {
      const unknown = skills.filter((s) => !knownSkillSet.has(s));
      if (unknown.length > 0) {
        issues.push({
          code: "unknown-skill",
          message: `Orchestration finding "${finding.id}" references unknown skills: ${unknown.join(", ")}.`,
          findingId: finding.id,
        });
        continue;
      }
    }

    if (typeof finding.evidence !== "string" || finding.evidence.trim().length === 0) {
      issues.push({
        code: "missing-evidence",
        message: `Orchestration finding "${finding.id}" has no evidence.`,
        findingId: finding.id,
      });
      continue;
    }
    if (sourceCorpus && !evidenceIsGrounded(finding.evidence, sourceCorpus)) {
      issues.push({
        code: "ungrounded-evidence",
        message: `Orchestration finding "${finding.id}" evidence was not found in the submitted skills.`,
        findingId: finding.id,
      });
      continue;
    }
    if (containsUrl(finding.evidence)) {
      issues.push({
        code: "url-in-evidence",
        message: `Orchestration finding "${finding.id}" evidence contains a URL.`,
        findingId: finding.id,
      });
      continue;
    }

    validFindings.push(
      createOrchestrationFinding(finding.ruleId, {
        skills,
        evidence: finding.evidence,
        severity: finding.severity,
      }),
    );
  }

  return {
    evaluation: {
      status: status === "complete" ? "complete" : "partial",
      findings: validFindings,
      summary: typeof evaluation.summary === "string" ? evaluation.summary : "",
      referenceIds: [
        ...new Set(validFindings.flatMap((finding) => finding.referenceIds)),
      ],
      parseError: evaluation.parseError,
    },
    issues,
  };
}
