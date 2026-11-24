import type { UnifiedStandardRule } from '../../contracts/UnifiedReview';

/**
 * Comparison changes weighting, not the existing local predicate decision.
 * Reuse its already-evaluated compatibility result; keep native evidence limitations visible.
 */
export function preserveStandardComparisonOutcome(rule: UnifiedStandardRule): UnifiedStandardRule {
  return {
    ...rule,
    evaluate(context) {
      const native = rule.evaluate(context);
      const countLimitation = 'Legacy configured-test-component threshold: at least 10; this is not a usable-case or execution count.';
      const assessment = rule.id === 'local-pattern-8' ? {
        ...native, fact: `${native.fact} ${countLimitation}`,
        findings: native.findings.map(finding => ({ ...finding, fact: `${finding.fact} ${countLimitation}` })),
      } : native;
      const pattern = assessment.compatibility?.standard;
      const outcome = pattern?.assessmentStatus;
      if (!pattern || (outcome !== 'pass' && outcome !== 'fail') || outcome === assessment.outcome
        || context.model.configurationAvailable === false) return assessment;
      return {
        ...assessment, outcome,
        fact: rule.id === 'local-pattern-8' ? `${pattern.description} ${countLimitation}` : pattern.description,
        reason: [
          'The existing local predicate decision is retained for same-capture comparison; evidence limitations remain flagged separately.',
          pattern.assessmentReason, assessment.reason,
        ].filter(Boolean).join(' '),
        findings: outcome === 'pass' ? [] : assessment.findings.length ? assessment.findings : [{
          id: rule.id, instanceId: `standard:${rule.id}:legacy-aggregate`,
          title: rule.title, fact: pattern.description, why: rule.why,
          fix: pattern.recommendation, severity: rule.severity,
          subject: context.model.botName, subjectId: context.model.botId,
          evidence: assessment.evidence, referenceIds: rule.referenceIds,
        }],
      };
    },
  };
}
