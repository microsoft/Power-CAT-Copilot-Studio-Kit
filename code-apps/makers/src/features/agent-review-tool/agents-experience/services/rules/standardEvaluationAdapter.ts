import type { EvaluationConfiguration, NormalizedEvaluationEvidence } from '../../contracts/EvaluationEvidence';
import type { UnifiedEvidence, UnifiedOutcome, UnifiedRuleMetadata, UnifiedStandardRule } from '../../contracts/UnifiedReview';
import type { CopilotInspection } from './copilotRuleDefinition';
import { unifiedAssessment } from './unifiedAssessment';
import { evaluationGraderRequiresExpectedResponse } from '../graders';

/** Adapt the evaluation-only predicate to Standard; never assert a Standard model is a Copilot model. */
export function defineStandardEvaluationRule(
  metadata: UnifiedRuleMetadata, inspect: (model: EvaluationConfiguration) => CopilotInspection,
): UnifiedStandardRule {
  const meta: UnifiedRuleMetadata = {
    ...metadata, supportedHarnesses: ['standard'],
    ...(metadata.id === 'EVL-04' ? {
      fact: 'Inspect expected responses on cases linked to captured sets that require similarity/text-match grading.',
      why: 'Reference responses are required by the case’s own set; requirements must not be borrowed from an unrelated set.',
    } : {}),
  };
  return {
    ...meta, harness: 'standard', legacyPattern: () => undefined,
    evaluate({ evaluation }) {
      if (!evaluation || evaluation.availability === 'unavailable') {
        return unifiedAssessment(meta, 'standard', 'could-not-run', {
          fact: 'Normalized evaluation-set/case evidence is unavailable.',
          reason: evaluation?.diagnostics.join(' ') || 'Capture readable evaluation components; configured-test counts do not establish evaluation evidence.',
          evidence: [{ fieldPath: 'evaluation', status: 'unavailable' }],
        });
      }
      let scope: EvaluationConfiguration = evaluation;
      let incomplete = evaluation.availability === 'partial';
      const reasons = [...evaluation.diagnostics];
      if (meta.id === 'EVL-04') {
        const requiredSets = evaluation.evaluationSets.filter(s => s.graders.some(evaluationGraderRequiresExpectedResponse));
        const requiredIds = new Set(requiredSets.map(s => s.id));
        scope = {
          ...evaluation, evaluationSets: requiredSets,
          testCases: evaluation.testCases.filter(c => c.setId && requiredIds.has(c.setId)),
        };
        if (evaluation.unlinkedCaseIds.length) {
          incomplete = true;
          reasons.push('Expected-response requirements cannot be attributed to cases without a captured set link.');
        }
      }
      const inspection = inspect(scope);
      let outcome: UnifiedOutcome = inspection.outcome;
      // Existence is proven by a captured set/conversation even when other cases are unsupported.
      const verifiedExistence = outcome === 'pass' && (meta.id === 'EVL-01' || meta.id === 'EVL-05');
      const capturedRecord = outcome === 'pass' && meta.kind === 'record';
      const verifiedCounterexample = outcome === 'fail' && meta.id === 'EVL-04';
      if (incomplete && !verifiedExistence && !capturedRecord && !verifiedCounterexample) outcome = 'could-not-run';
      const legacy = inspection.legacy === null ? [] : Array.isArray(inspection.legacy) ? inspection.legacy : [inspection.legacy];
      const evidence: readonly UnifiedEvidence[] = inspection.evidence?.map(item => ({
        ...item,
        reason: meta.id === 'EVL-04'
          ? 'This captured case is linked by set ID to a grader requiring an expected response.'
          : item.reason,
      })) ?? configurationEvidence(evaluation);
      const fact = legacy.length ? legacy.map(f => f.fact).join('\n')
        : inspection.reason ?? `${scope.evaluationSets.length} evaluation set(s), ${scope.testCases.length} case(s), ${scope.multiTurnCases.length} conversation case(s) captured.`;
      const reason = [
        ...reasons, inspection.reason,
        'Static configuration assessment only; no evaluations were executed.',
      ].filter(Boolean).join(' ');
      return unifiedAssessment(meta, 'standard', outcome, {
        fact: outcome === 'could-not-run' ? reason : fact,
        reason, incomplete: incomplete || outcome === 'could-not-run', evidence,
        findings: outcome === 'fail' ? legacy.map(f => ({
          id: meta.id, instanceId: `standard:${meta.id}:agent`, title: f.title,
          fact: f.fact, why: meta.why, fix: meta.fix, severity: meta.severity,
          subjectId: 'agent', evidence, referenceIds: meta.referenceIds,
          compatibility: { copilot: f },
        })) : [],
      });
    },
  };
}

function configurationEvidence(evaluation: NormalizedEvaluationEvidence): UnifiedEvidence[] {
  const identities = [...evaluation.evaluationSets, ...evaluation.testCases];
  return identities.length ? identities.map(item => ({
    componentId: item.componentIdUnique || item.componentId, schemaName: item.schemaname,
    fieldPath: 'evaluation', status: 'verified', quote: item.name,
    reason: 'Evaluation configuration captured from component metadata, not execution results.',
  })) : [{
    fieldPath: 'evaluation', status: evaluation.availability === 'complete' ? 'verified' : 'unavailable',
    quote: '0 evaluation sets and 0 cases captured.',
  }];
}
