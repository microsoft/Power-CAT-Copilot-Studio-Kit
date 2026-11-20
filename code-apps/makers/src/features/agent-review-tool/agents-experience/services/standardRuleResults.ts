/**
 * The Standard harness's review output, as rule outcomes the shared scorer can grade.
 *
 * This is the Standard counterpart of ARC2's `aiRuleResults` adapter: it converts one harness's
 * native output into the single `RuleEvaluationResult` vocabulary `computeGroundedScore` and
 * `computePillarBreakdown` already consume, so Standard can be scored by the same arithmetic as
 * Copilot instead of by its own 50/50 pattern/instruction blend.
 *
 * **Why a second adapter rather than reuse of ARC2's.** ARC2 parses the *persisted* review — JSON
 * of unknown vintage, read back out of Dataverse — so every field arrives as `unknown` and has to
 * be defended one property at a time. ART holds the *live, typed* stage outputs at assembly time.
 * The two therefore differ only in how they unwrap their input; the normalisation that actually
 * decides a verdict is shared, because both call ART's own `getInstructionAssessments`. Making ART
 * parse `unknown` to avoid a second file would buy a cosmetic deduplication with a real loss of
 * type safety.
 *
 * **Status mapping is deliberately identical to ARC2's `art-service.ts`.** Both apps must agree
 * about what a given stage output means, or the same review would score differently depending on
 * which app opened it. The two mappings are pinned against each other in the test file.
 *
 * **`AssessmentStatus` is read in preference to `Status`.** The two disagree on purpose: a pattern
 * that could not be judged still reports `Status: false` — "not confirmed" — alongside
 * `AssessmentStatus: 'not-assessed'`. Taking the boolean at face value reports the agent as failing
 * a check that never ran. Reviews predating `AssessmentStatus` fall back to the boolean, which is
 * all the evidence they carry.
 *
 * **`not-assessed` maps to `failed`, which is not a failing grade.** `failed` is the shared
 * scorer's word for "this check did not produce a verdict": `scoreLegacyDeterministicRules`
 * excludes it from the eligible denominator *and* sets `complete: false`, so an unrun check lowers
 * confidence in the score rather than the score itself. That is the "couldn't run is a status, not
 * a finding" rule applied to the Standard harness.
 *
 * **Pillars come from the registry, never from `family`.** A Standard pattern's `Category` is
 * `configuration` / `routing` / `instructions`, and none of those is a key in `FAMILY_TO_PILLAR`
 * (`Instructions`, `Evaluation`, `Skills`, `Tools`, `Knowledge`, `Connected agents`). The legacy
 * family fallback therefore resolves to `undefined` for *every* Standard pattern row, and an
 * unresolved row is dropped from its denominator silently. The registry is consequently the only
 * thing standing between a Standard pattern and no pillar at all, which is why
 * `standardRuleResults.test.ts` asserts that every id this adapter can emit is registered. That
 * assertion is the guard; there is no fallback to soften a miss, because a soft miss is exactly the
 * failure mode that cannot be noticed.
 */

import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import type {
  InstructionEvaluation,
  Pattern,
  PatternEvaluation,
} from '../../contracts/StageOutputs';
import { getInstructionAssessments } from '../../utils/reviewAssessment';
import {
  STANDARD_PATTERN_WORKFLOW_RULES,
  workflowPatternId,
} from '../../utils/standardReviewWorkflowRules';
import type { RuleEvaluationResult, RuleEvaluationStatus } from '../contracts/Findings';
import { ruleKey } from './dismissals';

/**
 * Pattern ids ART's corpus still emits under their pre-split name.
 *
 * `STD-PATTERN-TOOL-ROUTING-GAP` asked one question of a mixed population of tools and connected
 * agents. The registry splits it into `STD-TOL-ROUTING-DESCRIPTION` (tools) and
 * `STD-CON-DELEGATION-DESCRIPTION` (orchestration), and ARC2's `build-units.ts` performs that split
 * before the node ever sees it — but ART's own `standardReviewWorkflowRules.ts` still sends the
 * single legacy id, so live ART reviews and every historical row carry it.
 *
 * It resolves to the tools half rather than to both. One verdict is one measurement: emitting it
 * twice would manufacture a second observation the model never made, which is the precise class of
 * invented score this refactor exists to remove. The consequence — a legacy-vintage row scores in
 * Tools and contributes nothing to Orchestration — is visible and conservative, where a silent drop
 * from both would not be.
 *
 * The `workflow-<slug>` entries are the *other* vintage, and the one live reviews actually carry.
 * `projectPatterns` groups rules by `patternName` and names the resulting `Pattern` after the group
 * (`workflowPatternId`), discarding the rule id the AI returned — so without these entries every AI
 * verdict on a Standard agent resolves to no registered rule, `pillarForResult` returns `undefined`
 * and `familyRuleScore` drops the row from every pillar in silence. That is not a missing finding —
 * the findings still render — it is a finding that scores nothing, which reads on screen as a
 * pillar that was never measured.
 *
 * They are derived from `STANDARD_PATTERN_WORKFLOW_RULES` rather than written out, so a pattern
 * renamed or added cannot leave a mapping behind. A group is resolved by its first template's rule
 * id, for the same one-verdict reason as above.
 */
export const STANDARD_LEGACY_RULE_IDS: Readonly<Record<string, string>> = Object.freeze(
  STANDARD_PATTERN_WORKFLOW_RULES.reduce<Record<string, string>>(
    (map, template) => {
      const patternId = workflowPatternId(template.patternName);
      if (!(patternId in map)) map[patternId] = map[template.ruleId] ?? template.ruleId;
      return map;
    },
    { 'STD-PATTERN-TOOL-ROUTING-GAP': 'STD-TOL-ROUTING-DESCRIPTION' }
  )
);

/** The registered id a pattern id names, which for current-vintage output is itself. */
export function resolveStandardRuleId(patternId: string): string {
  return STANDARD_LEGACY_RULE_IDS[patternId] ?? patternId;
}

/** A failed check grades by the severity the corpus assigned it, matching the legacy credit table. */
function failureStatus(severity: Pattern['Severity']): RuleEvaluationStatus {
  return severity === 'High' ? 'error' : 'warning';
}

function patternStatus(pattern: Pattern): RuleEvaluationStatus {
  switch (pattern.AssessmentStatus) {
    case 'pass':
      return 'passed';
    case 'fail':
      return failureStatus(pattern.Severity);
    case 'not-applicable':
      return 'not-applicable';
    case 'not-assessed':
      return 'failed';
    default:
      return pattern.Status === true ? 'passed' : failureStatus(pattern.Severity);
  }
}

/** Every pattern the Standard harness ran, as a rule outcome — passes included, not only failures. */
export function standardPatternRuleResults(
  patternEvaluation?: PatternEvaluation
): RuleEvaluationResult[] {
  const patterns = patternEvaluation?.Patterns;
  if (!Array.isArray(patterns)) return [];

  return patterns.flatMap((pattern, index): RuleEvaluationResult[] => {
    if (!pattern || typeof pattern !== 'object') return [];
    const ruleId = resolveStandardRuleId(pattern.PatternId ?? `pattern-${index}`);

    return [
      {
        key: ruleKey(ruleId),
        ruleId,
        family: pattern.Category ?? 'Patterns',
        status: patternStatus(pattern),
        ...(pattern.PatternName ? { subject: pattern.PatternName } : {}),
      },
    ];
  });
}

/**
 * All 15 instruction criteria, graded.
 *
 * `getInstructionAssessments` is ART's own normaliser and already returns one assessment per
 * criterion — including a `not-assessed` placeholder when stage C returned nothing — so the full
 * denominator exists whether or not the model answered. Grading from the criterion list rather than
 * from the returned issues is what stops an empty `issues` array reading as fifteen passes.
 */
export function standardInstructionRuleResults(
  instructionEvaluation?: InstructionEvaluation
): RuleEvaluationResult[] {
  const assessmentById = new Map(
    getInstructionAssessments(instructionEvaluation).map(a => [a.criteriaId, a])
  );

  return COMPLIANCE_CRITERIA.map((criterion): RuleEvaluationResult => {
    const assessment = assessmentById.get(criterion.id);
    const status: RuleEvaluationStatus =
      assessment?.status === 'pass'
        ? 'passed'
        : assessment?.status === 'fail'
          ? criterion.inherentSeverity === 'High'
            ? 'error'
            : 'warning'
          : assessment?.status === 'not-applicable'
            ? 'not-applicable'
            : 'failed';

    return {
      key: ruleKey(criterion.id),
      ruleId: criterion.id,
      family: 'Instructions',
      status,
      subject: criterion.name,
    };
  });
}

/** The whole Standard review as rule outcomes: both stages, one list, registry-resolvable ids. */
export function standardRuleResults(
  patternEvaluation?: PatternEvaluation,
  instructionEvaluation?: InstructionEvaluation
): RuleEvaluationResult[] {
  return [
    ...standardPatternRuleResults(patternEvaluation),
    ...standardInstructionRuleResults(instructionEvaluation),
  ];
}
