/**
 * Grounded deterministic rule engine (spec 013 §2, §5). Runs every rule
 * family and flattens the findings; each finding carries its official
 * reference id. AI-elaborated findings are added separately by the orchestrator.
 */
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import type { GroundedFinding, RuleOutcome, RuleEvaluationStatus } from '../contracts/Findings';
import type { CopilotRuleContext, UnifiedRuleAssessment } from '../contracts/UnifiedReview';
import type { Rule } from './rules/ruleTypes';
import { instructionRules } from './rules/instructionRules';
import { toolRules } from './rules/toolRules';
import { skillRules } from './rules/skillRules';
import { knowledgeRules } from './rules/knowledgeRules';
import { modelRules } from './rules/modelRules';
import { connectedAgentRules } from './rules/connectedAgentRules';
import { evaluationRules } from './rules/evaluationRules';
import { lifecycleRules } from './rules/lifecycleRules';

export type { Rule } from './rules/ruleTypes';

export const ALL_RULES: Rule[] = [
  ...instructionRules, ...toolRules, ...skillRules, ...knowledgeRules, ...modelRules,
  ...connectedAgentRules, ...evaluationRules, ...lifecycleRules,
];

/** Worst-of-severities status for a single rule's own finding list (no findings = passed). */
function statusFromFindings(findings: GroundedFinding[]): 'passed' | 'info' | 'warning' | 'error' {
  if (findings.length === 0) return 'passed';
  if (findings.some(f => f.severity === 'error')) return 'error';
  if (findings.some(f => f.severity === 'warning')) return 'warning';
  return 'info';
}

/** Run base rules without reducing an explicit unavailable or N/A assessment to an empty finding list. */
export function runRules(
  model: AgentsExperienceModel,
  availability?: CopilotRuleContext['availability'],
): RuleOutcome {
  const outcome: RuleOutcome = { evaluated: ALL_RULES.length, findings: [], passedRuleIds: [], ruleResults: [] };
  for (const rule of ALL_RULES) {
    let result;
    let assessment: UnifiedRuleAssessment | undefined;
    let threw = false;
    try {
      assessment = rule.evaluate?.({ harness: 'copilot', model, availability });
      result = assessment
        ? assessment.findings.flatMap(finding => finding.compatibility?.copilot
          ? [finding.compatibility.copilot] : [])
        : rule.check(model);
    } catch (err) {
      console.error(`[CopilotReview] rule ${rule.id} failed`, err);
      result = null;
      threw = true;
    }
    const list = result === null ? [] : Array.isArray(result) ? result : [result];
    const status: RuleEvaluationStatus = threw || assessment?.outcome === 'could-not-run' ? 'failed'
      : assessment?.outcome === 'not-applicable' ? 'not-applicable'
        : assessment?.kind === 'record' || assessment?.severity === 'info' ? 'info'
          : assessment?.outcome === 'pass' ? 'passed'
            : assessment?.outcome === 'fail' ? rule.severity
              : statusFromFindings(list);
    // A thrown exception must never be scored as a pass (Task 3): it is
    // excluded from passedRuleIds and recorded as an explicit 'failed' outcome.
    if (status === 'passed') outcome.passedRuleIds.push(rule.id);
    outcome.findings.push(...list);
    outcome.ruleResults.push({
      key: rule.id,
      ruleId: rule.id,
      family: rule.family,
      status,
      kind: rule.kind,
      incomplete: assessment?.incomplete || undefined,
      reason: assessment?.reason,
    });
  }
  return outcome;
}
