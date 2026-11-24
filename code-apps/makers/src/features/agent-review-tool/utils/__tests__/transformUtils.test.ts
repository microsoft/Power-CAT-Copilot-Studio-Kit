import { describe, expect, it } from 'vitest';
import type { InstructionEvaluation, Pattern } from '../../contracts/StageOutputs';
import {
  countHighSeverityCompliance, countHighSeverityPatterns, countTotalIssues,
  getInstructionIssueDisplay, transformComplianceForDisplay, transformPatternsForDisplay,
} from '../transformUtils';

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    PatternId: 'synthetic-rule', PatternName: 'Missing Model Description',
    Recommendation: 'Document the eligible topic.', Status: false, Topics: [],
    ...overrides,
  };
}

describe('standard pattern display', () => {
  it.each([
    ['pass', true, 'Pass', 'success'],
    ['fail', false, 'Fail', 'danger'],
    ['not-applicable', null, 'N/A', 'informative'],
    ['not-assessed', null, 'Not assessed', 'informative'],
  ] as const)('resolves %s without using the legacy boolean', (assessmentStatus, status, label, color) => {
    const [row] = transformPatternsForDisplay([pattern({
      Status: assessmentStatus !== 'pass', AssessmentStatus: assessmentStatus,
    })]);
    expect(row).toMatchObject({ assessmentStatus, status, statusLabel: label, statusColor: color });
    expect(row.assessmentReason).toBeTruthy();
  });

  it('labels the historical ZIP test-case rule N/A internally without mutating saved data', () => {
    const input = pattern({ PatternName: 'Inadequate Test Cases', Status: false });
    const [row] = transformPatternsForDisplay([input], true);
    expect(row).toMatchObject({ status: null, statusLabel: 'N/A', statusColor: 'informative', notApplicable: true });
    expect(input.Status).toBe(false);
    expect(input.AssessmentStatus).toBeUndefined();
  });

  it('preserves every setting, empty reviewed value, and distinct available component identity', () => {
    const topics = [
      {
        item: 'Shared name', componentId: 'topic-one', variable: 'OrderId', setting: 'InputVariables.OrderId.Description',
        current: '', suggested: 'Order identifier.',
        evidence: { source: 'configuration' as const, status: 'verified' as const, quote: '', reason: 'The supplied value is empty.' },
      },
      { item: 'Shared name', componentId: 'topic-two', variable: 'Result', current: 'ok', suggested: 'Result description.' },
    ];
    const [row] = transformPatternsForDisplay([pattern({
      Topics: topics, EvidenceKind: 'configuration-fact', AssessmentReason: 'The setting is present and eligible.',
    })]);
    expect(row.rawTopics).toEqual(topics);
    expect(row.topicCount).toBe(2);
    expect(row.evidenceKind).toBe('configuration-fact');
    expect(row.assessmentReason).toBe('The setting is present and eligible.');
  });

  it('does not count unassessed and inapplicable checks as failed or high severity', () => {
    const patterns = [
      pattern({ AssessmentStatus: 'not-applicable' }),
      pattern({ AssessmentStatus: 'not-assessed' }),
    ];
    expect(countHighSeverityPatterns(patterns)).toBe(0);
    expect(countTotalIssues(patterns, null)).toBe(0);
  });

  it('retains all references but counts only confirmed failed settings', () => {
    const topics = [
      { item: 'Confirmed topic', assessmentStatus: 'fail' as const },
      { item: 'Unresolved topic', assessmentStatus: 'not-assessed' as const, assessmentReason: 'The source could not be read.' },
      { item: 'Event topic', assessmentStatus: 'not-applicable' as const, assessmentReason: 'An explicit event starts this topic.' },
    ];
    const [row] = transformPatternsForDisplay([pattern({ AssessmentStatus: 'fail', Topics: topics })]);
    expect(row.topicCount).toBe(1);
    expect(row.rawTopics).toEqual(topics);
    expect(countTotalIssues([pattern({ AssessmentStatus: 'fail', Topics: topics })], null)).toBe(1);
  });

  it('does not promote reference failures when the category itself is unresolved', () => {
    const [row] = transformPatternsForDisplay([pattern({
      AssessmentStatus: 'not-assessed', Topics: [{ item: 'A', assessmentStatus: 'fail' }],
    })]);
    expect(row.topicCount).toBe(0);
  });
});

describe('standard instruction display', () => {
  it('returns explicit unassessed criteria when instruction data is unavailable', () => {
    const rows = transformComplianceForDisplay(null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.assessmentStatus === 'not-assessed' && row.status === null)).toBe(true);
    expect(rows.every(row => row.assessmentReason && row.statusColor === 'informative')).toBe(true);
  });

  it('keeps legacy empty issue lists unassessed because no per-criterion outcomes were recorded', () => {
    expect(transformComplianceForDisplay({ compliancePercentage: 27, issues: [] })
      .every(row => row.statusLabel === 'Not assessed')).toBe(true);
  });

  it('gives explicit criterion outcomes priority over an empty list or missing-input sentinel', () => {
    const evaluation: InstructionEvaluation = {
      compliancePercentage: 100, issues: [{
        id: 'missing-instruction-input', title: 'Missing input', description: '',
        recommendation: '', severity: 'High',
      }],
      assessmentStatus: 'not-assessed', assessmentReason: 'The instruction input could not be read.',
    };
    const rows = transformComplianceForDisplay(evaluation);
    expect(rows.every(row => row.statusLabel === 'Not assessed')).toBe(true);
    expect(rows.every(row => row.assessmentReason === evaluation.assessmentReason)).toBe(true);
    expect(countHighSeverityCompliance(evaluation)).toBe(0);
    expect(countTotalIssues([], evaluation)).toBe(0);
  });

  it('preserves instruction coverage, evidence and limits without counting an unverified finding as failed', () => {
    const issue = {
      id: 'scope-definition-1', title: 'Narrow coverage', description: 'One situation is not covered.',
      recommendation: 'Clarify handling outside the listed case.', severity: 'High' as const,
      assessmentStatus: 'not-assessed' as const, assessmentReason: 'The quoted wording could not be matched.',
      coverage: 'incomplete' as const, uncoveredSituation: 'A request outside the listed workflow.',
      evidence: { source: 'instructions' as const, status: 'unverified' as const, quote: 'unmatched', reason: 'No exact match.' },
    };
    const evaluation = { compliancePercentage: 100, issues: [issue] };
    const row = transformComplianceForDisplay(evaluation).find(r => r.criteriaId === 'scope-definition')!;
    expect(row.statusLabel).toBe('Not assessed');
    expect(row.issues[0]).toMatchObject(issue);
    expect(row.issueCount).toBe(1);
    expect(countHighSeverityCompliance(evaluation)).toBe(0);
  });

  it('continues grouping historical issue-id variations into the same criterion', () => {
    const rows = transformComplianceForDisplay({
      compliancePercentage: 0,
      issues: [{ id: 'privacy-leak-1', title: 'Sensitive data', description: '', recommendation: '', severity: 'High' }],
    });
    expect(rows.find(row => row.criteriaId === 'privacy-and-sensitive-data')?.statusLabel).toBe('Fail');
  });

  it('normalizes legacy lowercase severity, derived titles and guidance references for display', () => {
    const rows = transformComplianceForDisplay({
      compliance: false,
      compliancePercentage: 0,
      issues: [{
        id: 'scope-definition-missing',
        description: 'A saved legacy review reported that scope boundaries are unclear.',
        recommendation: 'State the supported services and exclusions clearly.',
        severity: 'high',
        guidelineReference: 'Copilot Studio authoring: Define clear scope and boundaries',
      } as never],
    });
    const row = rows.find(item => item.criteriaId === 'scope-definition')!;
    expect(row.statusLabel).toBe('Fail');
    expect(row.issues[0]).toMatchObject({
      title: 'Scope Definition',
      severity: 'High',
      guidelineReference: 'Copilot Studio authoring: Define clear scope and boundaries',
    });
  });
});

describe('legacy pattern row visibility', () => {
  it('keeps trigger-phrase rows visible instead of filtering them from display counts', () => {
    const [row] = transformPatternsForDisplay([pattern({
      PatternName: 'Missing Trigger Phrases',
      AssessmentStatus: 'not-assessed',
      Status: false,
    })]);
    expect(row).toMatchObject({
      patternName: 'Missing Trigger Phrases',
      category: 'Orchestration',
      statusLabel: 'Not assessed',
    });
  });
});

describe('instruction issue display shared with the report', () => {
  const criterion = { assessmentStatus: 'fail', severity: 'High' } as const;

  it('inherits criterion severity and retains a valid failure without evidence', () => {
    expect(getInstructionIssueDisplay(criterion, { assessmentStatus: 'fail', severity: 'Low' }))
      .toEqual({ assessmentStatus: 'fail', severity: 'High' });
  });

  it.each(['future-status', 'pass', null, true])('does not treat invalid issue status %s as a failure', assessmentStatus => {
    expect(getInstructionIssueDisplay(criterion, { assessmentStatus, severity: 'Low' }))
      .toEqual({ assessmentStatus: 'not-assessed', severity: 'High' });
  });

  it.each(['not-applicable', 'not-assessed'] as const)('respects the parent criterion outcome %s', assessmentStatus => {
    expect(getInstructionIssueDisplay({ ...criterion, assessmentStatus }, { assessmentStatus: 'fail' }))
      .toEqual({ assessmentStatus, severity: 'High' });
  });

  it('preserves an unassessed issue within a failed criterion', () => {
    expect(getInstructionIssueDisplay(criterion, { assessmentStatus: 'not-assessed' }).assessmentStatus)
      .toBe('not-assessed');
  });

  it('uses the historical failed criterion when the issue has no explicit status', () => {
    expect(getInstructionIssueDisplay(criterion, { severity: 'Low' }).assessmentStatus).toBe('fail');
  });

  it('does not manufacture a passed issue from a passed criterion', () => {
    expect(getInstructionIssueDisplay({ ...criterion, assessmentStatus: 'pass' }, {}).assessmentStatus)
      .toBe('not-assessed');
  });
});
