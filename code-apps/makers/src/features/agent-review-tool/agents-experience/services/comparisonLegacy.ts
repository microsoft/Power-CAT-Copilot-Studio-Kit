import type { Pattern } from '../../contracts/StageOutputs';
import { buildLocalPatterns } from '../../utils/localPatternBuilder';
import { summarizePatternAssessments } from '../../utils/reviewAssessment';
import type { RuleEvaluationResult } from '../contracts/Findings';
import type { LegacyDeterministicBaseline } from '../contracts/UnifiedReviewComparison';
import type { UnifiedRuleAssessment, UnifiedRuleContext, UnifiedOutcome } from '../contracts/UnifiedReview';
import { runRules } from './GroundedRuleEngine';
import { getUnifiedRuleCatalog } from './UnifiedRuleEngine';
import { unifiedAssessment } from './rules/unifiedAssessment';
import { scoreLegacyDeterministicRules } from './scoring';

/** Adapt actual legacy predicate results without changing their boolean or severity-credit decisions. */
export function previousDeterministicAssessments(context: UnifiedRuleContext): UnifiedRuleAssessment[] {
  const catalog = getUnifiedRuleCatalog(context.harness);
  if (context.harness === 'standard') {
    return buildLocalPatterns(context.model).map(pattern => {
      const metadata = catalog.find(d => d.id === pattern.patternId)!;
      const status = pattern.assessmentStatus ?? (pattern.status ? 'pass' : 'fail');
      const outcome = status === 'not-assessed' ? 'could-not-run' : status;
      const evidence = (pattern.affectedItems ?? []).map(item => ({
        componentId: item.componentId, schemaName: item.schemaName,
        fieldPath: item.setting ?? 'configuration', quote: item.current,
        status: item.evidence?.status ?? 'unavailable' as const, reason: item.evidence?.reason,
      }));
      if (!evidence.length) evidence.push({
        componentId: context.model.botId, schemaName: undefined,
        fieldPath: 'configuration', quote: pattern.description,
        status: outcome === 'could-not-run' ? 'unavailable' : 'verified', reason: pattern.assessmentReason,
      });
      return unifiedAssessment(metadata, 'standard', outcome, {
        fact: pattern.description, reason: pattern.assessmentReason,
        fix: pattern.recommendation, incomplete: outcome === 'could-not-run' || !!context.model.parsingErrors?.length,
        evidence, compatibility: { standard: pattern },
        findings: outcome === 'fail' ? [{
          id: pattern.patternId, instanceId: `standard:${pattern.patternId}:agent`,
          title: pattern.patternName, fact: pattern.description, why: metadata.why,
          fix: pattern.recommendation, severity: metadata.severity, evidence, referenceIds: metadata.referenceIds,
          subjectId: context.model.botId,
        }] : [],
      });
    });
  }
  const legacy = runRules(context.model);
  return legacy.ruleResults.map(result => {
    const metadata = catalog.find(d => d.id === result.ruleId)!;
    const findings = legacy.findings.filter(f => f.id === result.ruleId);
    const outcome: UnifiedOutcome = result.status === 'failed' ? 'could-not-run'
      : result.status === 'not-applicable' ? 'not-applicable'
        : result.status === 'warning' || result.status === 'error' ? 'fail' : 'pass';
    const evidence = findings.map(f => ({
      componentId: f.componentIdUnique, fieldPath: 'configuration',
      quote: f.fact, status: 'verified' as const,
      reason: 'Legacy rule result projected from the same captured model.',
    }));
    return unifiedAssessment(metadata, 'copilot', outcome, {
      fact: findings.map(f => f.fact).join('\n') || 'The legacy predicate emitted no finding for this captured model.',
      reason: outcome === 'could-not-run' ? 'The legacy rule did not complete.'
        : 'Legacy outcome: a null/empty finding result was treated as passed by the existing engine.',
      incomplete: outcome === 'could-not-run' || context.model.unknownKinds.length > 0
        || Object.values(context.availability ?? {}).some(state => state !== undefined && state !== 'complete'),
      evidence, compatibility: { copilot: findings },
      findings: outcome === 'fail' ? findings.map(f => ({
        id: f.id, instanceId: `copilot:${f.id}:${encodeURIComponent(f.componentIdUnique ?? 'agent')}:${encodeURIComponent(f.fact)}`,
        title: f.title, fact: f.fact, why: f.why, fix: f.fix, severity: metadata.severity,
        subjectId: f.componentIdUnique ?? 'agent', evidence, referenceIds: [f.referenceId], compatibility: { copilot: f },
      })) : [],
    });
  });
}

/** A recomputation on the selected deterministic subset, never a saved ART overall rating. */
export function legacyDeterministicBaseline(
  harness: UnifiedRuleContext['harness'], assessments: readonly UnifiedRuleAssessment[],
): LegacyDeterministicBaseline {
  const incomplete = assessments.some(a => a.incomplete || a.outcome === 'could-not-run');
  if (harness === 'standard') {
    const patterns: Pattern[] = assessments.filter(a => a.kind !== 'record').map(a => ({
      PatternId: a.ruleId, PatternName: a.title, Description: a.fact, Recommendation: a.fix,
      Status: a.outcome === 'pass', AssessmentStatus: a.outcome === 'could-not-run' ? 'not-assessed' : a.outcome,
      Topics: a.compatibility?.standard?.affectedItems ?? [],
    }));
    return {
      value: summarizePatternAssessments(patterns).score,
      label: 'Same-capture Standard local-rule baseline (equal completed-check weights)',
      formula: 'standard-local-completed-pass-ratio', ruleCount: patterns.length,
      incomplete, origin: 'same-capture-recomputation',
    };
  }
  const results: RuleEvaluationResult[] = assessments.map(a => ({
    key: a.key, ruleId: a.ruleId, family: a.family, kind: a.kind,
    status: a.outcome === 'could-not-run' ? 'failed' : a.outcome === 'not-applicable' ? 'not-applicable'
      : a.kind === 'record' || a.severity === 'info' ? 'info'
        : a.outcome === 'pass' ? 'passed' : a.severity === 'high' ? 'error' : 'warning',
  }));
  return {
    value: scoreLegacyDeterministicRules(results).score,
    label: 'Same-capture Copilot base-rule baseline (legacy warning half-credit)',
    formula: 'copilot-base-legacy-credit-ratio', ruleCount: results.filter(r => r.kind !== 'record').length,
    incomplete, origin: 'same-capture-recomputation',
  };
}
