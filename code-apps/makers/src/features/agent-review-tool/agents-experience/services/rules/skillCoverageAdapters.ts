/**
 * Legacy projections for the `skill-coverage` family.
 *
 * The rules in `review-core/rules/skill-coverage.rules` own the verdicts. These
 * adapters own nothing but the shape: they take the rows those rules produced
 * and emit the exact `GroundedFinding`s `CopilotReviewService` has always
 * emitted, byte for byte. Nothing here re-derives a verdict.
 *
 * One function is a deliberate exception to the second half of that rule.
 * {@link instructionCoverageRuleResults} *does* add `RuleEvaluationResult`s,
 * because `INS-02`…`INS-07` produced findings and no rows at all, so the scorer
 * never saw them and setting one aside moved nothing. It still re-derives no
 * verdict — it projects the same assessment functions the findings read.
 *
 * Three legacy-only details live here rather than on the rules, because `Rule`
 * cannot express them and bending it to would change what the rules mean:
 *   - `AEX-01` is `severity: 'info'` as a rule (it scores nothing, by D-2.3-I)
 *     but has always rendered as a `warning` finding, so the finding severity is
 *     written literally here.
 *   - `SKL-06` varies its finding severity per conflict from an AI-supplied
 *     field; a `Rule` carries one severity for the whole claim.
 *   - The "covers all five documented elements" positive is emitted under the
 *     id `INS-02`, which the element rule for `role` also uses. See below.
 */
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import type { GroundedFinding, RuleEvaluationResult, RuleEvaluationStatus } from '../../contracts/Findings';
import type { SkillBundleEvaluation } from '../../contracts/SkillEvaluation';
import { INS_07 } from '../../../review-core/rules/instructions.rules';
import {
  AEX_01, assessInstructionElement, assessNamedCapabilityReferences, coversAllFiveElements,
  crossSkillConflictRowsFor, INSTRUCTION_COVERAGE_RULES, skillBandRowsFor,
  type InstructionCoverageAssessment,
} from '../../../review-core/rules/skill-coverage.rules';
import type { Rule, RuleOutcome } from '../../../review-core/rule';
import { INSTRUCTION_RULE_IDS } from '../skill/InstructionCoverageValidator';
import { readCopilotAiNarrative } from '../copilotAiNarrative';

/**
 * `AEX-01` — the unparsed components of a capture, as one aggregate warning.
 *
 * The rule answers per component, because that is what the maker has to go and
 * look at; the legacy finding is one row whose `fact` is those components joined
 * by newlines. Projecting rather than re-counting is what keeps the two in step.
 */
export function unknownSchemaFindings(model: AgentsExperienceModel): GroundedFinding[] {
  const outcome = AEX_01.check?.(model);
  if (!outcome || outcome.outcome !== 'fail') return [];
  const instances = outcome.instances ?? [];
  if (instances.length === 0) return [];
  return [{
    id: AEX_01.id, family: 'Parsing', severity: 'warning', referenceId: 'ms-agents-overview', ai: false,
    title: `${instances.length} components did not match a known schema`,
    fact: instances.map(instance => instance.detail).join('\n'),
    why: instances[0].why ?? '',
    fix: instances[0].makerAction,
  }];
}

/**
 * `INS-02`…`INS-06` — one warning per element the classifier found absent, plus
 * the aggregate positive.
 *
 * Iterates the classifier's own element order rather than the documented order,
 * because that is the order these findings have always appeared in.
 */
export function instructionCoverageFindings(
  assessment: InstructionCoverageAssessment,
): GroundedFinding[] {
  const findings: GroundedFinding[] = [];

  for (const element of assessment.elements) {
    if (element.present) continue;
    const outcome = assessInstructionElement(element.key, assessment);
    if (outcome.outcome !== 'fail') continue;
    const row = outcome.instances?.[0];
    if (!row) continue;
    const narrative = readCopilotAiNarrative(element);
    findings.push({
      id: INSTRUCTION_RULE_IDS[element.key], family: 'Instructions', severity: 'warning',
      referenceId: 'ms-authoring-instructions', ai: true,
      title: row.title, fact: row.detail, why: row.why ?? '', fix: row.makerAction,
      ...(narrative ? {
        findingTitle: narrative.findingTitle, findingFact: narrative.fact,
        whyItMatters: narrative.whyItMatters, makerAction: narrative.makerAction,
        acceptanceCheck: narrative.acceptanceCheck, suggestedText: narrative.suggestedText,
      } : {}),
    });
  }

  // The aggregate positive is published under `INS-02`, which is also the
  // element rule for `role`. One id, two claims — see the Phase 3 note; it is
  // left as it is because `validateRules` rejects a duplicate id and renaming
  // either claim would change what the UI and the export read. The condition is
  // a projection of the five rules (a `complete` classification in which every
  // element rule passed), not a second algorithm.
  if (coversAllFiveElements(assessment)) {
    findings.push({
      id: 'INS-02', family: 'Instructions', severity: 'info', referenceId: 'ms-authoring-instructions', ai: true,
      title: 'Instructions cover all five documented elements',
      fact: 'role, tone, boundaries, ambiguity handling, and escalation are all present',
      why: 'Microsoft\'s authoring guidance lists these five elements for effective instructions.',
      fix: 'No action required — surfaced as a positive finding.',
    });
  }

  return findings;
}

/**
 * `INS-02`…`INS-07` — the scoring rows for the rules the coverage node owns.
 *
 * These six produced findings and no `RuleEvaluationResult` at all, so the
 * scorer never saw them: a maker who set a coverage finding aside moved
 * nothing, because there was no row to credit.
 *
 * It re-derives no verdict. Every status here is a projection of the same
 * assessment functions the findings read, and those already refuse to report a
 * pass for a classifier that did not run. **That is what keeps a review
 * scoreable when the AI workflow is unreachable:** they answer `could-not-run`,
 * which maps to `failed`, and `scoreLegacyDeterministicRules` drops a `failed`
 * row from *both* sides of the ratio. The deterministic rules alone then decide
 * the score, and dismissal keeps working exactly as it did. No AI rule can be
 * credited for a run that never happened.
 *
 * Iterating {@link INSTRUCTION_COVERAGE_RULES} rather than
 * `assessment.elements` is load-bearing. An element the validator dropped as
 * malformed or fabricated is absent from `elements`, and that is precisely the
 * case `assessInstructionElement` answers `could-not-run` for; iterating the
 * elements would omit the row instead, and an omitted row reads as a pass.
 *
 * The aggregate "covers all five" positive that `instructionCoverageFindings`
 * publishes under `INS-02` is a *finding*, not a row, so it does not collide
 * with the `INS-02` row here. Anything that later derives rows from findings by
 * id would double-count it.
 */
export function instructionCoverageRuleResults(
  assessment: InstructionCoverageAssessment, namedCapability: boolean | undefined,
): RuleEvaluationResult[] {
  const results = [...INSTRUCTION_COVERAGE_RULES].map(([key, elementRule]) =>
    ruleResultFor(elementRule, assessInstructionElement(key, assessment)));
  results.push(ruleResultFor(INS_07, assessNamedCapabilityReferences(assessment, namedCapability)));
  return results;
}

function ruleResultFor(
  owner: Rule<AgentsExperienceModel>, outcome: RuleOutcome,
): RuleEvaluationResult {
  return {
    key: owner.id, ruleId: owner.id, family: 'Instructions',
    status: statusFor(owner, outcome),
    // Stated rather than left to `isRecordResult`'s legacy heuristic, which is
    // consulted only when `kind` is absent and which lists `INS-02` — an id it
    // holds for the retired `info` rule, not for the `role` element rule the
    // registry declares at medium severity. Without this, INS-02's row would be
    // read as a record and silently dropped from the scoring population.
    kind: 'check',
  };
}

/**
 * A rule's verdict as the status the scorer reads.
 *
 * The severity mapping is `arc2RuleResults`', so a rule scores the same whether
 * its verdict arrived as a node exception or as an assessment. `could-not-run`
 * becomes `failed` — a badly named identifier, but it is the persisted spelling
 * of "could not run", and the one status the scorer excludes from the ratio
 * instead of crediting or penalising it.
 */
function statusFor(owner: Rule<AgentsExperienceModel>, outcome: RuleOutcome): RuleEvaluationStatus {
  switch (outcome.outcome) {
    case 'pass': return 'passed';
    case 'not-applicable': return 'not-applicable';
    case 'could-not-run': return 'failed';
    case 'fail':
      return owner.severity === 'info' ? 'info' : owner.severity === 'medium' ? 'warning' : 'error';
  }
}

/** `SKL-04` — the band warning for one evaluated skill, if it missed Strong. */
export function skillBandFindings(evaluation: SkillBundleEvaluation): GroundedFinding[] {
  return skillBandRowsFor(evaluation).map(row => ({
    id: 'SKL-04', family: 'Skills', severity: 'warning' as const,
    referenceId: 'ms-skills-overview' as const, ai: true,
    title: row.title, fact: row.detail, why: row.why ?? '', fix: row.makerAction,
  }));
}

/** `SKL-06` — one finding per conflict, each keeping the evaluator's own severity. */
export function crossSkillConflictFindings(evaluation: SkillBundleEvaluation): GroundedFinding[] {
  return crossSkillConflictRowsFor(evaluation).map(({ instance, severity }) => ({
    id: 'SKL-06', family: 'Skills', severity,
    referenceId: 'ms-skills-overview' as const, ai: true,
    title: instance.title, fact: instance.detail, why: instance.why ?? '', fix: instance.makerAction,
  }));
}
