import { describe, expect, it } from 'vitest';
import { buildStandardReviewShellModel } from '../standardReviewShellModel';
import type { ReviewResult } from '../../contracts/ReviewResult';

function review(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    reviewId: 'r1',
    botId: 'bot-1',
    componentIdUnique: 'component-1',
    botName: 'Contoso Support Bot',
    overallScore: 72,
    patternScore: 63,
    instructionScore: 81,
    highSeverityCount: 1,
    mediumSeverityCount: 1,
    ...overrides,
  } as ReviewResult;
}

const patternsBlob = JSON.stringify({
  Patterns: [
    {
      PatternName: 'No fallback topic',
      Status: false,
      Severity: 'High',
      Category: 'Error handling',
      Description: 'd',
      Recommendation: 'r',
      AffectedTopics: ['Greeting'],
    },
    {
      PatternName: 'Human handoff is reachable',
      Status: true,
      Severity: 'Low',
      Category: 'Escalation',
      Description: 'd',
      Recommendation: 'r',
      AffectedTopics: [],
    },
  ],
});

describe('buildStandardReviewShellModel', () => {
  it('returns an inert model for a null review rather than throwing', () => {
    const model = buildStandardReviewShellModel(null);

    expect(model.patternRows).toEqual([]);
    expect(model.complianceRows).toEqual([]);
    expect(model.failedPatternCount).toBe(0);
    expect(model.failedComplianceCount).toBe(0);
    expect(model.stageAOutput).toBeNull();
    expect(model.isZipSource).toBe(false);
  });

  it('counts only failing rows, so a badge reports problems and not things', () => {
    const model = buildStandardReviewShellModel(review({ stageBOutput: patternsBlob }));

    expect(model.patternRows).toHaveLength(2);
    expect(model.failedPatternCount).toBe(1);
  });

  it('makes malformed stages visible instead of showing an empty success grid', () => {
    const model = buildStandardReviewShellModel(review({
      stageBOutput: '{ not json at all',
      stageCOutput: '<<<corrupt>>>',
      stageAOutput: 'also not json',
    }));

    expect(model.patternRows).toEqual([]);
    expect(model.complianceRows.length).toBeGreaterThan(0);
    expect(model.complianceRows.every(row => row.statusLabel === 'Not assessed')).toBe(true);
    expect(model.scores.notes.join(' ')).toMatch(/assessment data is unavailable/);
    expect(model.stageAOutput).toBeNull();
  });

  it('treats absent stage outputs the same as unparseable ones', () => {
    const model = buildStandardReviewShellModel(review());

    expect(model.patternRows).toEqual([]);
    expect(model.complianceRows.every(row => row.statusLabel === 'Not assessed')).toBe(true);
    expect(model.scores.notes.length).toBeGreaterThan(0);
    expect(model.stageAOutput).toBeNull();
  });

  it('parses a valid stageAOutput for the agent details drawer', () => {
    const model = buildStandardReviewShellModel(review({
      stageAOutput: JSON.stringify({ topics: [], tools: [] }),
    }));

    expect(model.stageAOutput).not.toBeNull();
  });

  it('flags a ZIP-sourced review, which hides the drawer Evals tab', () => {
    expect(buildStandardReviewShellModel(review({ sourceEnvironment: 'zip' })).isZipSource).toBe(true);
    expect(buildStandardReviewShellModel(review({ sourceEnvironment: 'prod' })).isZipSource).toBe(false);
  });

  it('uses resolved statuses for tab counts and the rail without altering saved scores', () => {
    const model = buildStandardReviewShellModel(review({
      patternScore: 45, instructionScore: 67, overallScore: 51,
      stageBOutput: JSON.stringify({
        Patterns: [
          { PatternName: 'Failed check', Status: false, AssessmentStatus: 'fail', Topics: [] },
          { PatternName: 'Passed check', Status: false, AssessmentStatus: 'pass', Topics: [] },
          { PatternName: 'Inapplicable check', Status: false, AssessmentStatus: 'not-applicable', Topics: [] },
          { PatternName: 'Unknown check', Status: false, AssessmentStatus: 'not-assessed', Topics: [] },
        ],
      }),
      stageCOutput: JSON.stringify({
        issues: [], compliancePercentage: 100,
        assessmentStatus: 'not-assessed', assessmentReason: 'The instruction input was unavailable.',
      }),
    }));
    expect(model.failedPatternCount).toBe(1);
    expect(model.failedComplianceCount).toBe(0);
    expect(model.patternAssessmentSummary).toBe('1 of 2 assessed checks failed; 1 not assessed; 1 N/A');
    expect(model.instructionAssessmentSummary).toMatch(/0 assessed instruction findings\. No completed criteria; \d+ not assessed/);
    expect(model.scores).toMatchObject({ pattern: 45, instruction: null, overall: 51 });
  });

  it('does not count the legacy ZIP test-case rule as either passed or failed', () => {
    const model = buildStandardReviewShellModel(review({
      sourceEnvironment: 'zip',
      stageBOutput: JSON.stringify({ Patterns: [
        { PatternName: 'Inadequate Test Cases', Status: false, Topics: [] },
      ] }),
    }));
    expect(model.patternRows[0].statusLabel).toBe('N/A');
    expect(model.failedPatternCount).toBe(0);
    expect(model.findingCounts.totalIssueCount).toBe(0);
    expect(model.patternAssessmentSummary).toBe('No completed checks; 1 N/A');
  });

  it('keeps visible legacy trigger-phrase rows in the pattern summary counts', () => {
    const model = buildStandardReviewShellModel(review({
      stageBOutput: JSON.stringify({ Patterns: [
        { PatternName: 'Missing Trigger Phrases', Status: false, AssessmentStatus: 'not-assessed', Topics: [] },
        { PatternName: 'Missing Model Description', Status: false, AssessmentStatus: 'fail', Topics: [] },
      ] }),
    }));
    expect(model.patternRows).toHaveLength(2);
    expect(model.patternAssessmentSummary).toBe('1 of 1 assessed checks failed; 1 not assessed');
  });

  it('counts pattern categories plus assessed instruction findings, separately from criterion rows', () => {
    const model = buildStandardReviewShellModel(review({
      stageBOutput: JSON.stringify({ Patterns: [{
        PatternName: 'Missing Model Name', Status: false, AssessmentStatus: 'fail',
        Topics: [{ item: 'First topic' }, { item: 'Second topic' }],
      }] }),
      stageCOutput: JSON.stringify({
        criterionAssessments: [{ criteriaId: 'scope-definition', status: 'fail' }],
        issues: [
          { id: 'first', criteriaId: 'scope-definition', severity: 'High', assessmentStatus: 'fail' },
          { id: 'second', criteriaId: 'scope-definition', severity: 'Medium', assessmentStatus: 'fail' },
          { id: 'unverified', criteriaId: 'scope-definition', severity: 'High', assessmentStatus: 'not-assessed' },
        ],
      }),
    }));
    expect(model.failedComplianceCount).toBe(1);
    expect(model.findingCounts).toMatchObject({
      failedPatternCount: 1, instructionIssueCount: 2, totalIssueCount: 3,
      highSeverityCount: 2, mediumSeverityCount: 1, lowSeverityCount: 0,
    });
    expect(model.instructionAssessmentSummary).toContain('2 assessed instruction findings');
    expect(model.instructionAssessmentSummary).toContain('1 of 1 assessed criteria failed');
  });

  it('does not multiply the missing-instructions finding by the number of failed criteria', () => {
    const model = buildStandardReviewShellModel(review({
      stageCOutput: JSON.stringify({
        issues: [{ id: 'missing-instruction-input', severity: 'High' }],
      }),
    }));
    expect(model.failedComplianceCount).toBeGreaterThan(1);
    expect(model.failedComplianceCount).toBe(model.complianceRows.length);
    expect(model.findingCounts).toMatchObject({
      failedPatternCount: 0, instructionIssueCount: 1, totalIssueCount: 1,
    });
    expect(model.instructionAssessmentSummary).toContain('1 assessed instruction finding.');
  });

  it('excludes a recorded issue when its criterion is explicitly N/A', () => {
    const model = buildStandardReviewShellModel(review({
      stageCOutput: JSON.stringify({
        criterionAssessments: [{ criteriaId: 'scope-definition', status: 'not-applicable' }],
        issues: [{ id: 'recorded', criteriaId: 'scope-definition', severity: 'High' }],
      }),
    }));
    expect(model.failedComplianceCount).toBe(0);
    expect(model.findingCounts).toMatchObject({ instructionIssueCount: 0, totalIssueCount: 0 });
  });

  it('uses instructions from the saved source snapshot when the root copy is absent', () => {
    const model = buildStandardReviewShellModel(review({
      stageAOutput: JSON.stringify({ topics: [], agentInstructions: 'Synthetic saved instructions.' }),
    }));
    expect(model.agentInstructions).toBe('Synthetic saved instructions.');
  });
});
