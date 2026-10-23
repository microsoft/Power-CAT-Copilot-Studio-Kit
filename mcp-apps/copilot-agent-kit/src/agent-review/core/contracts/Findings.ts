import type { ReferenceId } from './references.js';

export type FindingSeverity = 'error' | 'warning' | 'info';

/** Product treatment for a detected skill-security risk. */
export type SkillSafetyDisposition = 'advisory' | 'blocking';

/** Whether equivalent Copilot Studio runtime mitigation has been directly observed. */
export type PlatformOverlapState = 'observed' | 'unverified';

/** Return the user-facing product label for a safety disposition and overlap state. */
export function getSafetyDispositionLabel(
  disposition: SkillSafetyDisposition,
  platformOverlap: PlatformOverlapState | undefined,
): string {
  if (disposition === 'blocking') return 'Security blocker';
  return platformOverlap === 'observed'
    ? 'Prepublish advisory — platform runtime overlap observed'
    : 'Prepublish advisory — platform coverage unverified';
}

/**
 * The four fixed skill rubric dimensions used to group findings in the UI.
 * These mirror the bundle-level scores (quality/integrity/safety/readiness);
 * a fifth conceptual group, cross-skill orchestration, is agent-level and is
 * modelled separately (not a per-finding dimension).
 */
export type SkillRubricDimension = 'quality' | 'integrity' | 'safety' | 'readiness';

export interface GroundedFinding {
  id: string;                 // rule id, e.g. 'TOL-04'
  family: string;             // 'Tools', 'Skills', …
  severity: FindingSeverity;
  title: string;
  fact: string;               // parsed evidence (monospace block in UI)
  why: string;
  fix: string;
  referenceId: ReferenceId;
  ai: boolean;                // true when AI-elaborated (renders disclaimer chip)
  /** Product treatment, independent of the technical risk severity. */
  safetyDisposition?: SkillSafetyDisposition;
  /** Whether equivalent platform runtime mitigation has been observed. */
  platformOverlap?: PlatformOverlapState;
  /** Whether ART withheld the skill content from evaluator-model prompts. */
  skipAiEvaluation?: boolean;
  /**
   * The component this finding is about, as `componentIdUnique`.
   *
   * Stamped by the rule that produced the finding, which already holds the
   * component it is inspecting. This is the only reliable way to attach a
   * finding to a node in the Agent map: matching on the component name parsed
   * back out of the title is guesswork, and this codebase has already produced
   * wrong edges that way. A finding with no id here is simply not shown against
   * any node -- an unattributed finding is better than a misattributed one.
   *
   * Absent for agent-level findings (model, lifecycle, evaluation) that belong
   * to no single component, and for reviews saved before this field existed.
   */
  componentIdUnique?: string;
}

/**
 * Explicit deterministic outcome for one evaluated rule instance (spec 013
 * trustworthiness fix, Task 3). One rule (or, for per-skill rules, one
 * rule-per-skill instance) always resolves to exactly one status — never
 * inferred from counting findings at scoring time.
 */
export type RuleEvaluationStatus =
  | 'passed'
  | 'info'
  | 'warning'
  | 'error'
  | 'not-applicable'
  | 'failed';

/**
 * One deterministic rule-instance result. `key` is globally unique across the
 * whole review (e.g. the bare rule id for an agent-level rule, or
 * `${ruleId}:${skillSchemaName}` for a per-skill rule instance) so scoring can
 * safely deduplicate without collapsing distinct instances.
 */
export interface RuleEvaluationResult {
  key: string;
  ruleId: string;
  family: string;
  status: RuleEvaluationStatus;
  /**
   * What this instance evaluated, when a rule runs once per component.
   *
   * Skill rules run per skill, so four skills produce four SKL-14 rows. Without
   * a subject those rows are indistinguishable, and the checks view could only
   * match findings by rule id -- handing every row the same finding, so three
   * of the four named the wrong skill.
   *
   * `subjectId` is the componentIdUnique the findings carry, so matching is
   * strict id equality rather than a guess from the title text. Absent for
   * engine-level rules, which have exactly one instance.
   */
  subject?: string;
  subjectId?: string;
  /**
   * `record` marks an outcome that reports configuration rather than judging it.
   *
   * Carried through from the rule so the view can keep these out of the
   * checks-passed ratio without hardcoding a list of ids. Absent on reviews
   * saved before this existed, which the view resolves from the rule id.
   */
  kind?: 'check' | 'record';
}

export interface RuleOutcome {
  evaluated: number;
  findings: GroundedFinding[];
  passedRuleIds: string[];
  /** One explicit outcome per registered rule (Task 3). Additive — does not replace passedRuleIds. */
  ruleResults: RuleEvaluationResult[];
}

/** Severity scale for skill-specific findings (Task-4 contract). */
export type SkillFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Typed finding for skill bundle analysis rules (BND-xx, SKL-xx).
 * Extends the GroundedFinding compatibility shape with the full Task-4 contract:
 * ruleId, evidence, recommendation, ordered fixSteps, referenceIds, and confidence.
 * GroundedFinding is kept unchanged for backward-compatibility with existing rule engines.
 */
export interface GroundedSkillFinding extends Omit<GroundedFinding, 'severity'> {
  /** Skill severity scale: critical → high → medium → low → info. */
  severity: SkillFindingSeverity;
  /** Short rule identifier, e.g. "BND-01". */
  ruleId: string;
  /** Optional resource file path where the finding was detected. */
  resourcePath?: string;
  /** Optional chunk IDs for fine-grained source attribution. */
  chunkIds?: string[];
  /** Human-readable evidence text (mirrors fact). */
  evidence: string;
  /** Actionable recommendation (mirrors fix). */
  recommendation: string;
  /** Ordered remediation steps. */
  fixSteps: Array<{ order: number; action: string }>;
  /** All reference IDs supporting this finding. */
  referenceIds: ReferenceId[];
  /** Confidence level for the finding. */
  confidence: 'high' | 'medium' | 'low';
  /**
   * Rubric dimension this finding rolls up into for grouped display.
   * Authoritative for registered rules (sourced from the rule registry);
   * derived via {@link dimensionForRuleId} for findings built outside the registry.
   */
  dimension?: SkillRubricDimension;
}
