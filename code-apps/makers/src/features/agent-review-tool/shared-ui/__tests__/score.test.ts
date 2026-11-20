import { describe, expect, it } from 'vitest';
import { byImpact, scoreCardModel, type ScoreContributor } from '../score';

const pillar = (overrides: Partial<ScoreContributor> = {}): ScoreContributor => ({
  name: 'Instructions', score: 72, weight: 25, applicable: true, complete: true, ...overrides,
});

describe('scoreCardModel', () => {
  it('bands a score by the same thresholds the rest of the tool uses', () => {
    expect(scoreCardModel(pillar({ score: 80 })).tone).toBe('good');
    expect(scoreCardModel(pillar({ score: 79 })).tone).toBe('fair');
    expect(scoreCardModel(pillar({ score: 60 })).tone).toBe('fair');
    expect(scoreCardModel(pillar({ score: 59 })).tone).toBe('poor');
  });

  it('shows the weight, because a low score on a heavy pillar is a different problem', () => {
    expect(scoreCardModel(pillar({ weight: 30 })).footnote).toBe('Weight 30%');
    expect(scoreCardModel(pillar({ weight: 30 })).hint).toContain('30%');
  });

  it('marks a pillar whose evidence is incomplete', () => {
    expect(scoreCardModel(pillar({ complete: false })).footnote).toBe('Weight 25% · partial');
  });

  it('shows an inapplicable pillar instead of hiding it', () => {
    // An agent with no skills and an agent whose skills were not assessed look identical if the
    // card simply disappears.
    const model = scoreCardModel(pillar({ applicable: false, score: 0 }));
    expect(model.value).toBeUndefined();
    expect(model.muted).toBe(true);
    expect(model.footnote).toMatch(/not applicable/i);
  });

  it('renders a whole-number percentage', () => {
    expect(scoreCardModel(pillar({ score: 72.4 })).value).toBe('72%');
    expect(scoreCardModel(pillar({ score: 72.6 })).value).toBe('73%');
  });
});

describe('byImpact', () => {
  it('leads with the pillar losing the most points, not the lowest score', () => {
    // 0 on a 5-weight pillar loses 5 points; 40 on a 30-weight pillar loses 18. Sorting by score
    // alone would bury the one actually worth fixing.
    const order = byImpact([
      pillar({ name: 'Knowledge', score: 0, weight: 5 }),
      pillar({ name: 'Evaluation', score: 40, weight: 30 }),
      pillar({ name: 'Tools', score: 95, weight: 12 }),
    ]).map((item) => item.name);
    expect(order).toEqual(['Evaluation', 'Knowledge', 'Tools']);
  });

  it('puts pillars with no action to take last', () => {
    const order = byImpact([
      pillar({ name: 'Skills', applicable: false, score: 0, weight: 15 }),
      pillar({ name: 'Tools', score: 100, weight: 12 }),
    ]).map((item) => item.name);
    expect(order).toEqual(['Tools', 'Skills']);
  });

  it('breaks ties by name so the order does not shuffle between renders', () => {
    const tie = [pillar({ name: 'Zeta' }), pillar({ name: 'Alpha' })];
    expect(byImpact(tie).map((item) => item.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('does not mutate its input', () => {
    const input = [pillar({ name: 'B', score: 10 }), pillar({ name: 'A', score: 90 })];
    byImpact(input);
    expect(input.map((item) => item.name)).toEqual(['B', 'A']);
  });
});
