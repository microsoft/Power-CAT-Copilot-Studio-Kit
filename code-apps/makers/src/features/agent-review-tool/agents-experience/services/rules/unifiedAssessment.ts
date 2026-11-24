import type {
  UnifiedHarness, UnifiedOutcome, UnifiedRuleAssessment, UnifiedRuleMetadata,
} from '../../contracts/UnifiedReview';

/** Aggregate checks use the literal agent sentinel, not an array index or display name. */
export function unifiedAssessment(
  metadata: UnifiedRuleMetadata,
  harness: UnifiedHarness,
  outcome: UnifiedOutcome,
  details: Partial<Omit<UnifiedRuleAssessment, 'key' | 'ruleId' | 'harness' | 'outcome'>> = {},
): UnifiedRuleAssessment {
  return {
    key: `${harness}:${metadata.id}:${details.subjectId ? encodeURIComponent(details.subjectId) : 'agent'}`,
    ruleId: metadata.id, harness, family: metadata.family, severity: metadata.severity,
    kind: metadata.kind, title: metadata.title, fact: metadata.fact, why: metadata.why, fix: metadata.fix,
    tags: metadata.tags, referenceIds: metadata.referenceIds, source: 'deterministic',
    evidence: [], findings: [], incomplete: outcome === 'could-not-run', ...details, outcome,
  };
}
