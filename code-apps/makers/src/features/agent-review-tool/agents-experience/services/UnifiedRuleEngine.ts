import type {
  UnifiedHarness, UnifiedRuleAssessment, UnifiedRuleContext, UnifiedRuleDefinition,
  UnifiedRuleMetadata, UnifiedRuleReport,
} from '../contracts/UnifiedReview';
import { REFERENCES } from '../contracts/references';
import { standardSkillRules, unifiedSkillRules } from './rules/skillRules';
import { standardToolRules, unifiedToolRules } from './rules/toolRules';
import { standardConnectedAgentRules, unifiedConnectedAgentRules } from './rules/connectedAgentRules';
import {
  standardEvaluationRules, unifiedEvaluationRules, standardNativeEvaluationRules,
} from './rules/evaluationRules';
import { preserveStandardComparisonOutcome } from './rules/standardComparisonRule';
import { unifiedInstructionRules } from './rules/instructionRules';
import { unifiedKnowledgeRules } from './rules/knowledgeRules';
import { unifiedModelRules } from './rules/modelRules';
import { unifiedLifecycleRules } from './rules/lifecycleRules';
import { unifiedAssessment } from './rules/unifiedAssessment';
import { scoreUnifiedDeterministic, uniqueUnifiedAssessments } from './unifiedScoring';

export const UNIFIED_DETERMINISTIC_POLICY_VERSION = 'unified-deterministic-v1' as const;
export const UNIFIED_COMPARISON_POLICY_VERSION = 'unified-deterministic-v2-evaluation' as const;
const registry: readonly UnifiedRuleDefinition[] = [
  ...standardSkillRules, ...standardToolRules, ...standardConnectedAgentRules, ...standardEvaluationRules,
  ...unifiedInstructionRules, ...unifiedToolRules, ...unifiedSkillRules, ...unifiedKnowledgeRules,
  ...unifiedConnectedAgentRules, ...unifiedEvaluationRules, ...unifiedModelRules, ...unifiedLifecycleRules,
];

function validateRegistry(definitions: readonly UnifiedRuleDefinition[]): void {
  const ids = new Set<string>();
  for (const d of definitions) {
    const identity = `${d.harness}:${d.id}`;
    if (ids.has(identity)) throw new Error(`Duplicate unified rule ID: ${identity}`);
    ids.add(identity);
    if ([d.id, d.family, d.title, d.fact, d.why, d.fix].some(value => !value?.trim())
      || d.supportedHarnesses.length !== 1 || d.supportedHarnesses[0] !== d.harness
      || !['high', 'medium', 'info'].includes(d.severity)
      || !['check', 'record'].includes(d.kind) || (d.kind === 'record' && d.severity !== 'info')
      || !d.tags.length || d.tags.some(tag => !/^[a-z][a-z0-9-]*$/.test(tag))
      || !d.referenceIds.length || d.referenceIds.some(id => !Object.prototype.hasOwnProperty.call(REFERENCES, id))) {
      throw new Error(`Invalid unified rule metadata: ${d.id}`);
    }
  }
}

function validateAssessment(d: UnifiedRuleDefinition, a: UnifiedRuleAssessment): void {
  if (a.ruleId !== d.id || a.harness !== d.harness
    || a.key !== `${a.harness}:${d.id}:${a.subjectId ? encodeURIComponent(a.subjectId) : 'agent'}`
    || a.family !== d.family || a.severity !== d.severity || a.kind !== d.kind
    || [a.title, a.fact, a.why, a.fix].some(text => !text?.trim())
    || !['pass', 'fail', 'not-applicable', 'could-not-run'].includes(a.outcome)
    || (a.outcome === 'could-not-run' && (!a.incomplete || !a.reason?.trim()))
    || (a.outcome === 'fail' && (!a.evidence.length || !a.findings.length))) {
    throw new Error(`Invalid unified assessment contract: ${d.id}`);
  }
}

/** Static metadata only; consumers cannot execute a catalog entry or alter the registry. */
export function getUnifiedRuleCatalog(harness: UnifiedHarness): readonly UnifiedRuleMetadata[] {
  validateRegistry(registry);
  return registry.filter(d => d.harness === harness).map(d => ({
    id: d.id, family: d.family, title: d.title, fact: d.fact, why: d.why, fix: d.fix,
    severity: d.severity, kind: d.kind, tags: [...d.tags], referenceIds: [...d.referenceIds],
    supportedHarnesses: [...d.supportedHarnesses],
  }));
}

/** Injectable pure runner for contract tests; configuration/contract errors fail loudly. */
export function runUnifiedRegistry(
  context: UnifiedRuleContext, definitions: readonly UnifiedRuleDefinition[],
  policyVersion: string = UNIFIED_DETERMINISTIC_POLICY_VERSION,
): UnifiedRuleReport {
  validateRegistry(definitions);
  const assessments: UnifiedRuleAssessment[] = [];
  for (const definition of definitions) {
    if (definition.harness !== context.harness) continue;
    let assessment: UnifiedRuleAssessment;
    try {
      if (context.harness === 'standard' && definition.harness === 'standard') {
        assessment = definition.evaluate(context);
      } else if (context.harness === 'copilot' && definition.harness === 'copilot') {
        assessment = definition.evaluate(context);
      } else continue;
    } catch (error) {
      const reason = `Evaluator execution failed: ${error instanceof Error ? error.message : String(error)}`;
      assessment = unifiedAssessment(definition, context.harness, 'could-not-run', {
        fact: 'The deterministic evaluator did not complete.', reason, incomplete: true,
        evidence: [{ fieldPath: 'evaluation', status: 'unavailable', reason }],
      });
    }
    validateAssessment(definition, assessment);
    assessments.push(assessment);
  }
  const unique = uniqueUnifiedAssessments(assessments);
  return {
    harness: context.harness, policyVersion,
    assessments: unique, score: scoreUnifiedDeterministic(unique),
  };
}

/** Evaluate CP1's 11 Standard local checks or 29 Copilot BASE definitions only. */
export function evaluateUnifiedRules(context: UnifiedRuleContext): UnifiedRuleReport {
  return runUnifiedRegistry(context, registry);
}

/** Opt-in same-capture comparison; CP1 fixture/live producers keep their existing registry and policy. */
export function evaluateUnifiedComparisonRules(context: UnifiedRuleContext): UnifiedRuleReport {
  const definitions = [
    ...registry.map(d => d.harness === 'standard' ? preserveStandardComparisonOutcome(d) : d),
    ...standardNativeEvaluationRules,
  ];
  return runUnifiedRegistry(context, definitions, UNIFIED_COMPARISON_POLICY_VERSION);
}
