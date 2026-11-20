import { describe, expect, it } from 'vitest';
import type { InstructionEvaluation, Pattern } from '../../contracts/StageOutputs';
import {
  getPatternAssessment,
  summarizePatternAssessments,
  summarizeInstructionAssessments,
} from '../reviewAssessment';

const pattern = (Status: boolean, AssessmentStatus?: Pattern['AssessmentStatus']): Pattern => ({
  PatternId: 'synthetic-rule',
  PatternName: 'Synthetic rule',
  Recommendation: 'Review the setting.',
  Status,
  Topics: [],
  AssessmentStatus,
});

describe('standard review assessment outcomes', () => {
  it('keeps legacy boolean results but never awards a pass for an excluded outcome', () => {
    expect(getPatternAssessment({ Status: true })).toBe('pass');
    expect(getPatternAssessment({ Status: false })).toBe('fail');
    expect(getPatternAssessment({ Status: true, AssessmentStatus: 'not-applicable' })).toBe('not-applicable');
    expect(getPatternAssessment({ Status: false, AssessmentStatus: 'not-assessed' })).toBe('not-assessed');
    expect(getPatternAssessment({ Status: 'true' })).toBe('not-assessed');
    expect(getPatternAssessment({ Status: true, AssessmentStatus: 'invalid' })).toBe('not-assessed');
  });

  it('counts only completed applicable results in the pattern denominator', () => {
    const result = summarizePatternAssessments([
      pattern(true), pattern(false),
      pattern(true, 'not-applicable'), pattern(false, 'not-assessed'),
    ]);
    expect(result).toEqual({
      score: 50, completed: 2, passed: 1, failed: 1, notApplicable: 1, notAssessed: 1,
    });
  });

  it('does not fabricate 0 or 100 when no pattern was assessed', () => {
    expect(summarizePatternAssessments([]).score).toBeNull();
    expect(summarizePatternAssessments([
      pattern(true, 'not-applicable'), pattern(false, 'not-assessed'),
    ]).score).toBeNull();
  });

  it('uses the display alias rules for legacy issue identifiers without inferring omitted passes', () => {
    const result = summarizeInstructionAssessments({
      compliancePercentage: 100,
      issues: [{
        id: 'privacy-risk-1', title: 'Privacy gap', description: 'A policy needs clarification.',
        recommendation: 'Clarify sensitive-data handling.', severity: 'High',
      }],
    });
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.score).toBe(0);
  });

  it('retains the AR07 frozen category score when the failed category remains failed', () => {
    const patterns = [...Array.from({ length: 4 }, () => pattern(true)),
      ...Array.from({ length: 13 }, () => pattern(false))];
    expect(summarizePatternAssessments(patterns).score).toBe(24);
  });

  it('uses applicable instruction criteria weights, not an AI percentage', () => {
    const evaluation: InstructionEvaluation = {
      compliancePercentage: 99,
      issues: [],
      criterionAssessments: [
        { criteriaId: 'scope-definition', status: 'pass' },
        { criteriaId: 'fallback-when-uncertain', status: 'fail' },
        { criteriaId: 'tool-routing-hints', status: 'not-applicable' },
      ],
    };
    const result = summarizeInstructionAssessments(evaluation);
    expect(result.completed).toBe(2);
    expect(result.score).toBe(50);
    expect(result.notAssessed).toBeGreaterThan(0);
  });

  it('does not make missing instruction data or an empty assessment list a pass', () => {
    expect(summarizeInstructionAssessments(undefined).score).toBeNull();
    expect(summarizeInstructionAssessments({
      compliancePercentage: 100, issues: [], criterionAssessments: [],
    }).score).toBeNull();
  });

  it('does not count an explicitly unverified instruction issue as a failed criterion and leaves the criteria unassessed', () => {
    const result = summarizeInstructionAssessments({
      compliancePercentage: 0,
      issues: [{
        id: 'fallback-when-uncertain-1', title: 'A broad claim', description: 'Coverage needs confirmation.',
        recommendation: 'Identify the uncovered case.', severity: 'High',
        assessmentStatus: 'not-assessed',
      }],
    });
    expect(result.failed).toBe(0);
    expect(result.notAssessed).toBe(15);
  });
});
