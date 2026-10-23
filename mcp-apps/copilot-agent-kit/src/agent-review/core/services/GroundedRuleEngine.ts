/**
 * Grounded deterministic rule engine (spec 013 §2, §5). Runs every rule
 * family and flattens the findings; each finding carries its official
 * reference id. AI-elaborated findings are added separately by the orchestrator.
 */
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel.js';
import type { GroundedFinding, RuleOutcome } from '../contracts/Findings.js';
import type { Rule } from './rules/ruleTypes.js';
import { instructionRules } from './rules/instructionRules.js';
import { toolRules } from './rules/toolRules.js';
import { skillRules } from './rules/skillRules.js';
import { knowledgeRules } from './rules/knowledgeRules.js';
import { modelRules } from './rules/modelRules.js';
import { connectedAgentRules } from './rules/connectedAgentRules.js';
import { evaluationRules } from './rules/evaluationRules.js';
import { lifecycleRules } from './rules/lifecycleRules.js';

export type { Rule } from './rules/ruleTypes.js';

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

export function runRules(model: AgentsExperienceModel): RuleOutcome {
  const outcome: RuleOutcome = { evaluated: ALL_RULES.length, findings: [], passedRuleIds: [], ruleResults: [] };
  for (const rule of ALL_RULES) {
    let result;
    let threw = false;
    try {
      result = rule.check(model);
    } catch (err) {
      console.error(`[CopilotReview] rule ${rule.id} failed`, err);
      result = null;
      threw = true;
    }
    const list = result === null ? [] : Array.isArray(result) ? result : [result];
    // A thrown exception must never be scored as a pass (Task 3): it is
    // excluded from passedRuleIds and recorded as an explicit 'failed' outcome.
    if (!threw && list.length === 0) outcome.passedRuleIds.push(rule.id);
    outcome.findings.push(...list);
    outcome.ruleResults.push({
      key: rule.id,
      ruleId: rule.id,
      family: rule.family,
      status: threw ? 'failed' : statusFromFindings(list),
      kind: rule.kind,
    });
  }
  return outcome;
}
