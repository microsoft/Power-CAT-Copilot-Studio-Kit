import { describe, expect, it } from 'vitest';
import type { ReviewResult } from '../../contracts/ReviewResult';
import type { Pattern } from '../../contracts/StageOutputs';
import { generateSARIF } from '../exportUtils';

const failed: Pattern = {
  PatternId: 'missing-description', PatternName: 'Missing Input Variable Description',
  Status: false, AssessmentStatus: 'fail', Severity: 'Medium',
  Recommendation: 'Describe the workshop code.',
  Topics: [{
    item: 'Workshop Lookup', componentId: 'workshop-topic', schemaName: 'synthetic.workshop',
    variable: 'workshopCode', setting: 'Input variable description',
    evidence: { source: 'configuration', status: 'verified', reason: 'No description was found.' },
  }],
};

function review(patterns: Pattern[] = [failed]): ReviewResult {
  return {
    botId: 'synthetic-agent', botName: 'Review Demo', componentIdUnique: 'synthetic-agent',
    overallScore: 25, patternScore: 24, instructionScore: 26,
    highSeverityCount: 0, mediumSeverityCount: 1, lowSeverityCount: 0, totalIssueCount: 1,
    reviewedOn: new Date('2025-01-02T00:00:00Z'), durationMs: 0, status: 'completed',
    reviewKind: 'standard',
    stageBOutput: JSON.stringify({ Patterns: patterns }),
    stageCOutput: JSON.stringify({ compliancePercentage: 0, issues: [], assessmentStatus: 'not-applicable' }),
  };
}

describe('standard SARIF assessment and evidence export', () => {
  it('exports only failures and discloses incomplete assessments', () => {
    const report = generateSARIF(review([
      failed,
      { ...failed, PatternId: 'excluded', AssessmentStatus: 'not-applicable' },
      { ...failed, PatternId: 'unknown', AssessmentStatus: 'not-assessed' },
      { ...failed, PatternId: 'passed', Status: true, AssessmentStatus: 'pass' },
    ]));
    expect(report.runs[0].results).toHaveLength(1);
    expect(report.runs[0].invocations?.[0].executionSuccessful).toBe(false);
    expect(report.runs[0].properties?.assessmentStatus).toBe('partial');
  });

  it('retains per-variable evidence and stable component identity', () => {
    const result = generateSARIF(review()).runs[0].results[0];
    expect(result.properties?.affectedSettings).toEqual(failed.Topics);
    expect(result.locations?.[0].physicalLocation.artifactLocation.uri).toBe('copilot://topics/workshop-topic');
  });

  it('marks an unresolved reference as partial even when its category retains a confirmed failure', () => {
    const references: Pattern['Topics'] = [
      { ...failed.Topics[0], assessmentStatus: 'fail' },
      {
        item: 'Unreadable topic', componentId: 'unknown-topic', assessmentStatus: 'not-assessed',
        assessmentReason: 'The source could not be read.', current: 'An unverified claim.',
      },
    ];
    const run = generateSARIF(review([{ ...failed, Topics: references }])).runs[0];
    expect(run.invocations[0].executionSuccessful).toBe(false);
    expect(run.properties.assessmentStatus).toBe('partial');
    expect(run.results[0].properties?.affectedSettings).toEqual([references[0]]);
    expect(run.results[0].properties?.recordedReferences).toEqual(references);
    expect(run.results[0].locations).toHaveLength(1);
  });

  it('uses distinct schemas for same-name saved references without component IDs', () => {
    const result = generateSARIF(review([{
      ...failed,
      Topics: ['synthetic.first', 'synthetic.second'].map(schemaName => ({
        ...failed.Topics[0], componentId: undefined, schemaName,
      })),
    }])).runs[0].results[0];
    expect(result.locations?.map(location => location.physicalLocation.artifactLocation.uri))
      .toEqual(['copilot://topics/synthetic.first', 'copilot://topics/synthetic.second']);
  });

  it.each(['{', '{}', '{"Patterns":null}'])('does not create a clean export from unreadable pattern data: %s', stageBOutput => {
    expect(() => generateSARIF({ ...review(), stageBOutput })).toThrow(/stored.*unreadable/i);
  });

  it('makes absent source data explicit without asserting an executed assessment', () => {
    const report = generateSARIF({ ...review(), stageBOutput: undefined, stageCOutput: undefined });
    expect(report.runs[0].results).toEqual([]);
    expect(report.runs[0].invocations?.[0].executionSuccessful).toBe(false);
    expect(report.runs[0].properties?.assessmentStatus).toBe('not-assessed');
  });

  it('does not count an unassessed instruction claim as a failure', () => {
    const result = generateSARIF({
      ...review([]),
      stageCOutput: JSON.stringify({
        compliancePercentage: 0, assessmentStatus: 'not-assessed',
        issues: [{ id: 'scope-definition-1', title: 'Scope', severity: 'High',
          description: 'A reported gap.', recommendation: 'Check the scope.', assessmentStatus: 'not-assessed' }],
      }),
    });
    expect(result.runs[0].results).toEqual([]);
  });
});
