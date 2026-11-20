import { describe, expect, it } from 'vitest';
import type { CriterionResult, DAEvaluationResult } from '../contracts/DAEvaluationResult';
import { calculateDAScore, criterionScore } from '../utils/scoreCalculator';

function criterion(status: CriterionResult['status']): CriterionResult {
  return { status, issues: [], passingChecks: [] };
}

function evaluation(overrides: Partial<DAEvaluationResult> = {}): DAEvaluationResult {
  return {
    instructionsCriterion: criterion('Pass'),
    knowledgeCriterion: criterion('Pass'),
    capabilitiesCriterion: criterion('Pass'),
    actionsCriterion: criterion('Pass'),
    conversationStartersCriterion: criterion('Pass'),
    gracefulErrorHandlingCriterion: criterion('Pass'),
    summary: 'Synthetic result.',
    ...overrides,
  };
}

describe('DA score exclusions', () => {
  it('returns no criterion score for N/A or Not assessed', () => {
    expect(criterionScore(criterion('N/A'))).toBeNull();
    expect(criterionScore(criterion('Not assessed'))).toBeNull();
  });

  it('redistributes weight across assessed criteria', () => {
    expect(calculateDAScore(evaluation({
      instructionsCriterion: criterion('Fail'),
      actionsCriterion: criterion('N/A'),
      conversationStartersCriterion: criterion('Not assessed'),
    }))).toBe(60);
  });

  it('returns null when no criterion was assessed', () => {
    expect(calculateDAScore(evaluation({
      instructionsCriterion: criterion('Not assessed'),
      knowledgeCriterion: criterion('Not assessed'),
      capabilitiesCriterion: criterion('N/A'),
      actionsCriterion: criterion('N/A'),
      conversationStartersCriterion: criterion('N/A'),
      gracefulErrorHandlingCriterion: criterion('Not assessed'),
    }))).toBeNull();
  });
});
