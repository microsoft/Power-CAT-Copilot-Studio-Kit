import type { UnifiedDeterministicScore, UnifiedRuleAssessment } from '../contracts/UnifiedReview';

function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/** Retries are idempotent; contradictory rows are invalid input, never last-write-wins. */
export function uniqueUnifiedAssessments(assessments: readonly UnifiedRuleAssessment[]): UnifiedRuleAssessment[] {
  const unique = new Map<string, UnifiedRuleAssessment>();
  for (const assessment of assessments) {
    if (!assessment.key.trim()) throw new Error('An assessment key must not be blank.');
    const previous = unique.get(assessment.key);
    if (previous && canonical(previous) !== canonical(assessment)) {
      throw new Error(`Conflicting assessments for key "${assessment.key}".`);
    }
    if (!previous) unique.set(assessment.key, assessment);
  }
  return [...unique.values()];
}

/** Severity-weighted, binary-credit PREVIEW only; no pillar or Evaluation evidence formula. */
export function scoreUnifiedDeterministic(assessments: readonly UnifiedRuleAssessment[]): UnifiedDeterministicScore {
  const unique = uniqueUnifiedAssessments(assessments);
  let earnedWeight = 0;
  let possibleWeight = 0;
  let completed = 0;
  let couldNotRun = 0;
  let notApplicable = 0;
  const contributions = unique.map(assessment => {
    const weight = assessment.kind === 'record' ? 0
      : assessment.severity === 'high' ? 1 : assessment.severity === 'medium' ? 0.5 : 0;
    const complete = assessment.outcome === 'pass' || assessment.outcome === 'fail';
    const possible = complete ? weight : 0;
    const earned = assessment.outcome === 'pass' ? possible : 0;
    if (weight) {
      if (complete) completed++;
      else if (assessment.outcome === 'could-not-run') couldNotRun++;
      else if (assessment.outcome === 'not-applicable') notApplicable++;
    }
    earnedWeight += earned;
    possibleWeight += possible;
    return { key: assessment.key, earnedWeight: earned, possibleWeight: possible };
  });
  const diagnostics = unique.filter(a => a.outcome === 'could-not-run' || a.incomplete)
    .map(a => `${a.key}: ${a.reason ?? 'Assessment evidence is incomplete.'}`);
  if (unique.length < assessments.length) diagnostics.push('Identical repeated assessment keys were counted once.');
  return {
    value: possibleWeight ? Math.round(100 * earnedWeight / possibleWeight) : null,
    earnedWeight, possibleWeight, completed, couldNotRun, notApplicable,
    coverage: completed + couldNotRun ? Math.round(100 * completed / (completed + couldNotRun)) : null,
    incomplete: unique.some(a => a.incomplete || a.outcome === 'could-not-run'),
    contributions, diagnostics,
  };
}
