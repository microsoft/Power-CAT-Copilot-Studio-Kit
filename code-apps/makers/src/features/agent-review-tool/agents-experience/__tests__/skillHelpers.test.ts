import { describe, expect, it } from 'vitest';
import {
  dimensionBand,
  evaluationStateLabel,
  scoreBand,
  skillScorePercent,
  weakestDimension,
} from '../components/skillHelpers';
import type { SkillView } from '../components/viewTypes';

/** Minimal SkillView builder for helper-level unit tests. */
function skill(over: Partial<SkillView> = {}): SkillView {
  return {
    name: 'test-skill',
    description: 'desc',
    source: 'inline',
    safetyFlagged: false,
    sizeLabel: '1.0 KB',
    dimensions: [],
    evaluationState: 'unavailable',
    markdown: '',
    ...over,
  };
}

describe('skillScorePercent', () => {
  it('returns null when a skill has no real dimensions (Task 2 — no synthetic grade)', () => {
    expect(skillScorePercent(skill({ dimensions: [] }))).toBeNull();
  });

  it('returns 0 for a genuine evaluator result of 0 — never null', () => {
    const s = skill({
      evaluationState: 'evaluated',
      dimensions: [
        { key: 'Clarity', score: 0, rationale: '' },
        { key: 'Actionability', score: 0, rationale: '' },
      ],
    });
    expect(skillScorePercent(s)).toBe(0);
  });

  it('rounds the average of real dimensions to a percent', () => {
    const s = skill({
      evaluationState: 'evaluated',
      dimensions: [
        { key: 'Clarity', score: 8, rationale: '' },
        { key: 'Actionability', score: 6, rationale: '' },
      ],
    });
    // avg = 7 -> 70%
    expect(skillScorePercent(s)).toBe(70);
  });

  it('averages only the dimensions present for a partial evaluation (2 of 4)', () => {
    const s = skill({
      evaluationState: 'partial',
      dimensions: [
        { key: 'Clarity', score: 10, rationale: '' },
        { key: 'Actionability', score: 4, rationale: '' },
      ],
    });
    // avg = 7 -> 70%, computed only from the two available dimensions
    expect(skillScorePercent(s)).toBe(70);
  });
});

describe('weakestDimension', () => {
  it('returns null when there are no real dimensions', () => {
    expect(weakestDimension(skill({ dimensions: [] }))).toBeNull();
  });

  it('returns the lowest-scoring real dimension', () => {
    const s = skill({
      dimensions: [
        { key: 'Clarity', score: 9, rationale: 'strong' },
        { key: 'Scope discipline', score: 3, rationale: 'weak' },
      ],
    });
    expect(weakestDimension(s)?.key).toBe('Scope discipline');
  });
});

describe('scoreBand / dimensionBand', () => {
  it('bands a percent into Strong/Good/Needs work', () => {
    expect(scoreBand(85).label).toBe('Strong');
    expect(scoreBand(65).label).toBe('Good');
    expect(scoreBand(10).label).toBe('Needs work');
  });

  it('bands a 0-10 dimension score', () => {
    expect(dimensionBand(9)).toBe('success');
    expect(dimensionBand(7)).toBe('warning');
    expect(dimensionBand(2)).toBe('danger');
  });
});

describe('evaluationStateLabel — truthful non-percent labels (Task 2)', () => {
  it('labels an unavailable skill "Not evaluated" by default', () => {
    expect(evaluationStateLabel(skill({ evaluationState: 'unavailable' })).label).toBe('Not evaluated');
  });

  it('prefers the fixed evaluationMessage when present', () => {
    const label = evaluationStateLabel(skill({
      evaluationState: 'unavailable',
      evaluationMessage: 'The AI rubric evaluator was not available for this skill.',
    })).label;
    expect(label).toBe('The AI rubric evaluator was not available for this skill.');
  });

  it('labels a blocked skill "AI evaluation withheld" — never a fake 0%', () => {
    expect(evaluationStateLabel(skill({ evaluationState: 'blocked' })).label).toBe('AI evaluation withheld');
  });

  it('labels a failed skill "Evaluation failed" — never "0%"', () => {
    const label = evaluationStateLabel(skill({ evaluationState: 'failed' })).label;
    expect(label).toBe('Evaluation failed');
    expect(label).not.toContain('0%');
  });

  it('labels a cancelled skill "Evaluation cancelled" — never "0%"', () => {
    const label = evaluationStateLabel(skill({ evaluationState: 'cancelled' })).label;
    expect(label).toBe('Evaluation cancelled');
    expect(label).not.toContain('0%');
  });

  it('labels a partial skill "Partial evaluation"', () => {
    expect(evaluationStateLabel(skill({ evaluationState: 'partial' })).label).toBe('Partial evaluation');
  });
});
