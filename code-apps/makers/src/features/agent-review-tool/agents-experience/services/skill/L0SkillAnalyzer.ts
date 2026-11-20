/**
 * L0 skill analyzer (research §4.1, §4.4 deterministic parts).
 *
 * Since Step 2.3 this is an adapter rather than an evaluator. Every rule it
 * reports -- SKL-01, 02, 03, 05, 07, 11, 12, 13 and 14 -- is declared in
 * `review-core/rules/skill-authoring.rules.ts`, which now owns the logic and the
 * prose that used to be string literals here. `assessSkillAuthoring` decides all
 * nine once, and this module projects that single assessment into the shape the
 * agents-experience pipeline has always consumed: one `GroundedFinding` per
 * offending rule, one `RuleEvaluationResult` per rule instance, and the hard
 * safety gate -- any unmitigated critical/high safety finding blocks the L1 AI
 * judge for that skill (research §5 threat model).
 *
 * SKL-05 contributes a status here but no finding: its `GroundedFinding` is
 * assembled from `safetyFindings` by `skl05FromSafety` in `CopilotReviewService`,
 * which is where it was before the migration and where it stays.
 */
import type { AeSkill } from '../../contracts/AgentsExperienceModel';
import type { GroundedFinding, RuleEvaluationResult } from '../../contracts/Findings';
import type { SkillSafetyFinding } from '../../contracts/SkillEvaluation';
import type { RuleInstance } from '../../../review-core/rule';
import { assessSkillAuthoring, type SkillAuthoringVerdict } from '../../../review-core/rules/skill-authoring.rules';

export interface L0SkillResult {
  skillName: string;
  frontmatterFindings: GroundedFinding[];
  safetyFindings: SkillSafetyFinding[];
  sizeLabel: string;
  structureOk: boolean;
  /** True when an unmitigated critical/high safety finding is a product release blocker. */
  blocked: boolean;
  /** True when the skill content must not be sent to an evaluator-model prompt. */
  skipAiEvaluation: boolean;
  /**
   * One explicit deterministic outcome per per-skill rule instance (Task 3):
   * SKL-01/02/03/05/07 are always evaluated; SKL-11/12/13/14 only when their
   * applicability condition holds (otherwise 'not-applicable', not a pass).
   * Keys are `${ruleId}:${skill.schemaname}` so two skills never collide.
   */
  ruleResults: RuleEvaluationResult[];
}

/** One rule instance, rendered as the frontmatter finding this analyzer publishes. */
function fmFinding(verdict: SkillAuthoringVerdict, instance: RuleInstance): GroundedFinding {
  return {
    id: verdict.ruleId,
    family: 'Skills',
    severity: verdict.severity,
    title: instance.title,
    fact: instance.detail,
    why: instance.why ?? '',
    fix: instance.makerAction,
    referenceId: verdict.referenceId,
    ai: false,
  };
}

export function analyzeSkillL0(skill: AeSkill): L0SkillResult {
  const assessment = assessSkillAuthoring(skill);

  // Verdicts arrive in rule order and each carries at most one instance, so
  // flattening them reproduces the emission order this analyzer always had.
  const frontmatterFindings: GroundedFinding[] = assessment.verdicts.flatMap(
    verdict => verdict.instances.map(instance => fmFinding(verdict, instance)),
  );

  // Every result below is about this one skill, so the subject is a property of
  // the pass rather than of the individual rule -- the same reasoning that
  // stamps componentIdUnique on the frontmatter findings.
  const subject = assessment.skillName;
  const subjectId = skill.componentIdUnique;
  const ruleResults: RuleEvaluationResult[] = assessment.verdicts.map(verdict => ({
    key: `${verdict.ruleId}:${skill.schemaname}`,
    ruleId: verdict.ruleId,
    family: 'Skills',
    status: verdict.status,
    subject,
    subjectId,
  }));

  return {
    skillName: assessment.skillName,
    // Stamped once here rather than at each `fmFinding` call site: every
    // frontmatter finding in this pass is about this one skill, so attributing
    // them is a property of the pass, not of the individual rule.
    frontmatterFindings: skill.componentIdUnique
      ? frontmatterFindings.map(f => ({ ...f, componentIdUnique: skill.componentIdUnique }))
      : frontmatterFindings,
    safetyFindings: assessment.safetyFindings,
    sizeLabel: assessment.sizeLabel,
    structureOk: assessment.structureOk,
    blocked: assessment.blocked,
    skipAiEvaluation: assessment.skipAiEvaluation,
    ruleResults,
  };
}
