import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildDAReviewShellModel } from '../adapters/daReviewShellModel';
import { buildDAScoreBreakdown } from '../adapters/daScoreBreakdown';
import { DAScoreHint } from '../components/DAScoreHint';
import type {
  CriterionResult, DAEvaluationResult, EvaluationStatus,
} from '../contracts/DAEvaluationResult';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { calculateDAScore } from '../utils/scoreCalculator';

const criterion = (status: EvaluationStatus): CriterionResult => ({
  status, issues: [], passingChecks: [],
});

function evaluation(statuses: EvaluationStatus[]): DAEvaluationResult {
  return {
    instructionsCriterion: criterion(statuses[0]),
    knowledgeCriterion: criterion(statuses[1]),
    capabilitiesCriterion: criterion(statuses[2]),
    actionsCriterion: criterion(statuses[3]),
    conversationStartersCriterion: criterion(statuses[4]),
    gracefulErrorHandlingCriterion: criterion(statuses[5]),
    summary: 'Synthetic review.',
  };
}

function review(overrides: Partial<DAReviewRecord> = {}): DAReviewRecord {
  return {
    componentIdUnique: 'synthetic-agent',
    agentName: 'Synthetic agent',
    agentVersion: '1.0.0',
    publisherName: 'Contoso',
    sourceType: 'zip',
    overallScore: 99,
    iconBase64: null,
    ...overrides,
  };
}

const render = (record: DAReviewRecord) => {
  const model = buildDAReviewShellModel(record);
  return renderToStaticMarkup(createElement(DAScoreHint, model));
};

describe('Declarative Agent score explanation', () => {
  it('explains the 27/100 example with the six actual weights and point totals', () => {
    const record = review({
      evaluation: evaluation(['Fail', 'Warning', 'Warning', 'Fail', 'Warning', 'Fail']),
    });
    const model = buildDAReviewShellModel(record);
    expect(model.score).toBe(27);
    expect(model.scoreBreakdown.map((part) => part.effectiveWeight))
      .toEqual([30, 20, 15, 15, 10, 10]);
    expect(model.scoreBreakdown.map((part) => part.points)).toEqual([0, 12, 9, 0, 6, 0]);
    expect(model.subScores).toHaveLength(6);

    const html = render(record);
    expect(html).toContain('Instructions Quality (0/100)');
    expect(html).toContain('Knowledge Sources (60/100)');
    expect(html).toContain('12 points');
    expect(html).toContain('9 points');
    expect(html).toContain('6 points');
    expect(html).toContain('27/100');
    expect(html).toContain('×30%');
    expect(html).toContain('Pass = 100, Warning = 60, Fail = 0');
    expect(html).toContain('Package validity and custom skill quality are separate checks');
  });

  it('uses exact weights and points when N/A and Not assessed criteria are excluded', () => {
    const record = review({
      evaluation: evaluation(['Pass', 'Warning', 'Fail', 'N/A', 'Not assessed', 'N/A']),
    });
    const model = buildDAReviewShellModel(record);
    expect(model.score).toBe(65);
    expect(model.scoreBreakdown[0].effectiveWeight).toBeCloseTo(30 / 65 * 100, 12);
    expect(model.scoreBreakdown[1].points).toBeCloseTo(60 * 20 / 65, 12);
    expect(model.scoreBreakdown.slice(3).map((part) => part.effectiveWeight)).toEqual([0, 0, 0]);
    expect(model.scoreBreakdown.slice(3).map((part) => part.points)).toEqual([0, 0, 0]);
    expect(model.subScores).toHaveLength(3);
    const html = render(record);
    expect(html).toContain('×46.15%');
    expect(html).toContain('18.46 points');
    expect(html).toContain('N/A, excluded');
    expect(html).toContain('Not assessed, excluded');
    expect(html).toContain('Round the total once');
  });

  it('does not infer missing action or starter counts from an absent manifest', () => {
    const model = buildDAReviewShellModel(review({
      evaluation: evaluation(['Pass', 'Pass', 'Pass', 'Fail', 'Warning', 'Pass']),
    }));
    expect(model.sections.find((part) => part.tab === 'actions')?.result?.status).toBe('Fail');
    expect(model.sections.find((part) => part.tab === 'starters')?.result?.status).toBe('Warning');
    expect(model.sections.map((part) => part.weightLabel))
      .toEqual(['30%', '20%', '15%', '15%', '10%', '10%']);
    expect(model.subScores.map((part) => part.weight))
      .toEqual(['30%', '20%', '15%', '15%', '10%', '10%']);
  });

  it('does not count a failed criterion as unassessed', () => {
    const record = review({
      evaluation: evaluation(['Fail', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']),
    });
    const model = buildDAReviewShellModel(record);
    expect(model.score).toBe(0);
    expect(model.scoreBreakdown[0].effectiveWeight).toBe(100);
    expect(render(record)).toContain('Instructions Quality (0/100)');
    expect(render(record)).toContain('0/100');
  });

  it('has no score when all criteria are unassessed, even if the record has a flat score', () => {
    const record = review({
      evaluation: evaluation(['Not assessed', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']),
    });
    expect(buildDAReviewShellModel(record).score).toBeNull();
    expect(render(record)).toContain('No quality score is available');
    expect(render(record)).not.toContain('99/100');
  });

  it('retains an old saved score without inventing criterion weights', () => {
    const record = review({ evaluation: undefined, overallScore: 42 });
    const model = buildDAReviewShellModel(record);
    expect(model.score).toBe(42);
    expect(model.scoreBreakdown).toEqual([]);
    const html = render(record);
    expect(html).toContain('Saved quality score');
    expect(html).toContain('42/100');
    expect(html).toContain('criterion results needed to explain its calculation are not available');
    expect(html).not.toContain('×30%');
  });

  it('has no invented calculation when both the old score and evaluation are missing', () => {
    const html = render(review({ overallScore: null }));
    expect(html).toContain('No quality score is available');
    expect(html).not.toContain('Overall quality score');
    expect(html).not.toContain('Saved quality score');
  });

  it('matches the unchanged score calculator for every combination of recorded statuses', () => {
    const statuses: EvaluationStatus[] = ['Pass', 'Warning', 'Fail', 'N/A', 'Not assessed'];
    for (let mask = 0; mask < statuses.length ** 6; mask++) {
      let remainder = mask;
      const combination = Array.from({ length: 6 }, () => {
        const status = statuses[remainder % statuses.length];
        remainder = Math.floor(remainder / statuses.length);
        return status;
      });
      const result = evaluation(combination);
      const parts = buildDAScoreBreakdown(result);
      const assessed = parts.filter((part) => part.score !== null);
      const score = calculateDAScore(result);
      expect(assessed.length === 0).toBe(score === null);
      if (score !== null) {
        expect(Math.round(parts.reduce((sum, part) => sum + part.points, 0))).toBe(score);
        expect(parts.reduce((sum, part) => sum + part.effectiveWeight, 0))
          .toBeCloseTo(100, 10);
        expect(parts.reduce((sum, part) => sum + part.points, 0))
          .toBeCloseTo(assessed.reduce((sum, part) =>
            sum + (part.score ?? 0) * part.configuredWeight, 0) /
            assessed.reduce((sum, part) => sum + part.configuredWeight, 0), 10);
      }
    }
  });
});
