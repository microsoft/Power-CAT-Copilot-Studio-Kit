import { ScoreHint } from '../../shared/review-shell/ScoreHint';
import type { DAReviewShellModel } from '../adapters/daReviewShellModel';

/** Explains the displayed quality score without calculating a replacement score. */
export function DAScoreHint({
  score,
  scoreBreakdown,
}: Pick<DAReviewShellModel, 'score' | 'scoreBreakdown'>) {
  const assessed = scoreBreakdown.filter((part) => part.score !== null);
  const format = (value: number) => String(Number(value.toFixed(2)));
  const breakdown = scoreBreakdown.map((part) => ({
    key: part.key,
    label: part.score === null ? part.label : `${part.label} (${part.score}/100)`,
    weight: part.score === null ? undefined : `${format(part.effectiveWeight)}%`,
    value: part.score === null ? `${part.status}, excluded` : `${format(part.points)} points`,
  }));

  return (
    <ScoreHint
      basis={assessed.length > 0
        ? 'Add each criterion score multiplied by its effective weight. Round the total once. Pass = 100, Warning = 60, Fail = 0.'
        : score === null
          ? 'No quality score is available because no quality criterion was assessed.'
          : 'This is the saved quality score. The criterion results needed to explain its calculation are not available.'}
      caveat="It measures the uploaded declaration and semantic evidence. It does not test runtime behavior."
      redistribution="N/A and Not assessed criteria have no score. Their weight is shared across the assessed quality criteria. Weights and points below are rounded for display; the score uses exact values. Package validity and custom skill quality are separate checks. They do not change this quality score."
      breakdownLabel="Criterion scores, effective weights, and points"
      breakdown={[
        ...breakdown,
        ...(score === null ? [] : [{
          key: 'overall',
          label: assessed.length > 0 ? 'Overall quality score' : 'Saved quality score',
          value: `${score}/100`,
        }]),
      ]}
    />
  );
}
