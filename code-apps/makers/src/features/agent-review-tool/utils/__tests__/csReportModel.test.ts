import { describe, expect, it } from 'vitest';
import { buildCsReportModel } from '../csReportModel';
import { countReviewFindings } from '../reviewAssessment';
import { STANDARD_REVIEW_LIMITS } from '../standardReviewProjection';
import { createReportReview, EXPORTED_ON, REPORT_INSTRUCTIONS, REPORT_PATTERNS } from './csPdfFixtures';

describe('saved review report projection', () => {
  it.each([false, true])('retains the fixed scope notice as safe factual context (public-safe: %s)', redactSensitiveValues => {
    const model = buildCsReportModel(createReportReview(), { redactSensitiveValues });
    expect(model.limits).toContain(STANDARD_REVIEW_LIMITS);
  });

  it('uses saved scores rather than nested AI percentages or a new assessment calculation', () => {
    const model = buildCsReportModel(createReportReview(), { exportedOn: EXPORTED_ON });
    expect(model.scores).toMatchObject({ pattern: 24, instruction: 61, overall: 54 });
    expect(model.counts.failedCheckCategories).toBe(1);
    expect(model.counts.instructionIssues).toBe(1);
    expect(model.counts.severity).toEqual({ High: 1, Medium: 1, Low: 0, Unspecified: 0 });
  });

  it('keeps stored instruction issue severity distinct from inherent pattern and criterion severity', () => {
    const evaluation = {
      ...REPORT_INSTRUCTIONS,
      issues: [{ ...REPORT_INSTRUCTIONS.issues[0], severity: 'Low' as const }],
    };
    const model = buildCsReportModel(createReportReview({
      stageCOutput: JSON.stringify(evaluation),
    }));
    expect(model.patterns[0].severity).toBe('Medium');
    expect(model.instructionIssues[0].severity).toBe('Low');
    expect(model.instructionCriteria.find(row => row.id === 'scope-definition')?.severity).toBe('High');
    expect(model.counts.severity).toEqual({ High: 0, Medium: 1, Low: 1, Unspecified: 0 });
    const shared = countReviewFindings(REPORT_PATTERNS, evaluation);
    expect(model.counts).toMatchObject({
      failedCheckCategories: shared.failedPatternCount,
      instructionIssues: shared.instructionIssueCount,
      total: shared.totalIssueCount,
      severity: { High: shared.highSeverityCount, Medium: shared.mediumSeverityCount, Low: shared.lowSeverityCount },
    });
  });

  it('does not invent an instruction issue severity when the saved value is missing', () => {
    const model = buildCsReportModel(createReportReview({
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        issues: [{ ...REPORT_INSTRUCTIONS.issues[0], severity: undefined }],
      }),
    }));
    expect(model.instructionIssues[0].severity).toBe('Unspecified');
    expect(model.instructionCriteria.find(row => row.id === 'scope-definition')?.severity).toBe('High');
    expect(model.counts.severity).toEqual({ High: 0, Medium: 1, Low: 0, Unspecified: 1 });
  });

  it('keeps multiple settings on the same topic as distinct detail items', () => {
    const model = buildCsReportModel(createReportReview());
    expect(model.patterns[0].items).toHaveLength(2);
    const details = JSON.stringify(model.patterns[0].items);
    for (const value of ['requestId', 'locale', 'component-alpha', 'inputs.requestId.description']) {
      expect(details.includes(value), value).toBe(true);
    }
    expect(details).toContain('Empty value');
    expect(details).toContain('verified');
  });

  it('retains malformed rows as unassessed placeholders instead of losing or counting them as failures', () => {
    const model = buildCsReportModel(createReportReview({
      stageBOutput: JSON.stringify({ Patterns: [REPORT_PATTERNS[0], null, { Status: false }] }),
      stageCOutput: JSON.stringify({ issues: [null], criterionAssessments: 'invalid' }),
    }));
    expect(model.patterns).toHaveLength(3);
    expect(model.patterns.map(row => row.status)).toEqual(['fail', 'not-assessed', 'not-assessed']);
    expect(model.instructionIssues[0].status).toBe('not-assessed');
    expect(model.counts.failedCheckCategories).toBe(1);
    expect(model.counts.instructionIssues).toBe(0);
    expect(model.limits.join(' ')).toMatch(/malformed|unavailable/i);
  });

  it('distinguishes unavailable stages and empty saved result arrays', () => {
    const missing = buildCsReportModel(createReportReview({ stageBOutput: undefined, stageCOutput: '{invalid' }));
    const empty = buildCsReportModel(createReportReview({
      stageBOutput: '{"Patterns":[]}', stageCOutput: '{"issues":[],"criterionAssessments":[]}',
    }));
    expect(missing.availability.patterns).toBe('unavailable');
    expect(missing.availability.instructions).toBe('unavailable');
    expect(empty.availability.patterns).toBe('partial');
    expect(empty.counts.failedCheckCategories).toBe(0);
    expect(empty.instructionCriteria.every(row => row.status === 'not-assessed')).toBe(true);
    expect(empty.limits.join(' ')).toContain('No pattern check rows');
  });

  it.each([
    { Patterns: [null, { PatternName: 'Incomplete check' }] },
    { Patterns: {} },
    {},
  ])('describes a parseable pattern stage with incomplete rows as partial: %o', patternStage => {
    const model = buildCsReportModel(createReportReview({ stageBOutput: JSON.stringify(patternStage) }));
    expect(model.availability.patterns).toBe('partial');
    expect(model.limits.join(' ')).not.toMatch(/Pattern assessment data (?:is )?unavailable/);
    expect(model.patterns.every(row => row.status === 'not-assessed')).toBe(true);
  });

  it.each([{ issues: {} }, {}])('describes an incomplete parseable instruction list as partial: %o', instructionStage => {
    const model = buildCsReportModel(createReportReview({ stageCOutput: JSON.stringify(instructionStage) }));
    expect(model.availability.instructions).toBe('partial');
    expect(model.limits.join(' ')).not.toMatch(/Instruction assessment data (?:is )?unavailable/);
    expect(model.instructionCriteria.every(row => row.status === 'not-assessed')).toBe(true);
    expect(model.instructionCriteria.map(row => row.fields).flat().map(field => field.value).join(' '))
      .not.toContain('Instruction assessment data is unavailable.');
  });

  it('retains readable failures and saved scores in partial pattern and instruction stages', () => {
    const model = buildCsReportModel(createReportReview({
      stageBOutput: JSON.stringify({ Patterns: [REPORT_PATTERNS[0], null, { PatternName: 'Incomplete check' }] }),
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS, issues: [REPORT_INSTRUCTIONS.issues[0], null],
      }),
    }));
    expect(model.availability).toEqual({ patterns: 'partial', instructions: 'partial' });
    expect(model.scores).toMatchObject({ overall: 54, pattern: 24, instruction: 61 });
    expect(model.counts).toMatchObject({
      total: 2, severity: { High: 1, Medium: 1, Low: 0, Unspecified: 0 },
    });
    expect(model.limits.join(' ')).not.toMatch(/(?:Pattern|Instruction) assessment data (?:is )?unavailable/);
  });

  it('does not infer passed coverage for a modern stage with no criterion outcomes', () => {
    const model = buildCsReportModel(createReportReview({
      stageCOutput: JSON.stringify({ policyVersion: 'standard-review-2', issues: [] }),
    }));
    expect(model.instructionCriteria.every(row => row.status === 'not-assessed')).toBe(true);
    expect(model.availability.instructions).toBe('partial');
  });

  it('does not infer successful criteria from a malformed legacy issue list', () => {
    const model = buildCsReportModel(createReportReview({
      assessmentPolicyVersion: undefined,
      stageCOutput: JSON.stringify({ issues: [null] }),
    }));
    expect(model.instructionCriteria.some(row => row.status === 'pass')).toBe(false);
    expect(model.instructionIssues[0].status).toBe('not-assessed');
  });

  it('retains readable legacy failures while withholding inferred passes from an incomplete issue list', () => {
    const model = buildCsReportModel(createReportReview({
      stageCOutput: JSON.stringify({ issues: [null, REPORT_INSTRUCTIONS.issues[0]] }),
    }));
    expect(model.instructionIssues.map(row => row.status)).toEqual(['not-assessed', 'fail']);
    expect(model.counts.instructionIssues).toBe(1);
    expect(model.instructionCriteria.some(row => row.status === 'pass')).toBe(false);
  });

  it('counts individual instruction issues, not their shared criterion or their quotes', () => {
    const model = buildCsReportModel(createReportReview({
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        issues: [
          REPORT_INSTRUCTIONS.issues[0],
          { ...REPORT_INSTRUCTIONS.issues[0], id: 'scope-definition-2', title: 'A different scope situation' },
        ],
      }),
    }));
    expect(model.counts.instructionIssues).toBe(2);
    expect(model.counts.severity.High).toBe(2);
    expect(model.instructionCriteria.filter(row => row.status === 'fail')).toHaveLength(1);
  });

  it('excludes every issue when the saved instruction stage is explicitly not applicable', () => {
    const model = buildCsReportModel(createReportReview({
      stageCOutput: JSON.stringify({ ...REPORT_INSTRUCTIONS, assessmentStatus: 'not-applicable' }),
    }));
    expect(model.instructionIssues.every(row => row.status === 'not-applicable')).toBe(true);
    expect(model.counts.instructionIssues).toBe(0);
  });

  it('retains a valid legacy zero without treating it as missing or regrading the review', () => {
    const model = buildCsReportModel(createReportReview({
      patternScore: 0, instructionScore: 13, overallScore: 7,
      assessmentPolicyVersion: undefined, scoreState: undefined,
      stageAOutput: undefined,
      stageBOutput: JSON.stringify({ Patterns: [{ ...REPORT_PATTERNS[0], AssessmentStatus: undefined }] }),
      stageCOutput: JSON.stringify({ compliancePercentage: 95, issues: [] }),
    }));
    expect(model.scores).toMatchObject({ pattern: 0, instruction: 13, overall: 7, legacy: true });
    expect(model.limits.join(' ')).toMatch(/legacy|historic/i);
  });

  it('does not expose source values or free-text paths anywhere in a public-safe projection', () => {
    const secret = 'SYNTHETIC_SENSITIVE_VALUE';
    const source = 'C:\\restricted\\source\\agent.yaml';
    const review = createReportReview({
      botName: secret, reviewedBy: secret, sourceEnvironment: source, agentVersion: source,
      stageAOutput: JSON.stringify({ source: 'zip', parsingErrors: [source], policyVersion: source }),
      stageBOutput: JSON.stringify({
        policyVersion: source, assessmentNotes: [secret],
        Patterns: [{ ...REPORT_PATTERNS[0], PatternId: secret, Description: source,
          Recommendation: secret, AssessmentReason: secret,
          Topics: [{ item: secret, variable: secret, current: secret, suggested: secret,
            componentId: secret, setting: source,
            evidence: { source: 'configuration', status: 'verified', quote: secret, reason: source } }] }],
      }),
    });
    const full = buildCsReportModel(review);
    const redacted = buildCsReportModel(review, { redactSensitiveValues: true });
    const output = JSON.stringify(redacted);
    expect(output.includes(secret)).toBe(false);
    expect(output.includes('restricted')).toBe(false);
    expect(redacted.counts).toEqual(full.counts);
    expect(redacted.scores).toEqual(full.scores);
    expect(redacted.patterns[0].items).toHaveLength(1);
    expect(output).toContain('Omitted for public-safe export');
  });

  it('shows unknown dates explicitly and rejects an invalid requested export timestamp', () => {
    const model = buildCsReportModel(createReportReview({ reviewedOn: new Date('invalid') }));
    expect(model.metadata.find(field => field.label === 'Review date')?.value).toBe('Unavailable');
    expect(() => buildCsReportModel(createReportReview(), { exportedOn: new Date('invalid') }))
      .toThrow('Invalid export date');
  });

  it.each([undefined, null, '', 0, 'not a date', '2026-02-30T10:00:00Z', '2026-13-01', '09/01/2026'])(
    'does not invent a historical timestamp from missing or invalid data: %s', value => {
      const review = createReportReview({ reviewedOn: value as unknown as Date });
      const model = buildCsReportModel(review, { exportedOn: EXPORTED_ON });
      expect(model.metadata.find(field => field.label === 'Review date')?.value).toBe('Unavailable');
      expect(model.metadata.find(field => field.label === 'Export date')?.value).toBe('2026-09-08 12:00:00 UTC');
    },
  );

  it('preserves a valid historical offset timestamp rather than using the export date', () => {
    const model = buildCsReportModel(createReportReview({
      reviewedOn: '2026-09-01T10:00:00+05:30' as unknown as Date,
    }), { exportedOn: EXPORTED_ON });
    expect(model.metadata.find(field => field.label === 'Review date')?.value).toBe('2026-09-01 04:30:00 UTC');
  });

  it('does not invent midnight or a timezone when only the historical date was saved', () => {
    const model = buildCsReportModel(createReportReview({
      reviewedOn: '2026-09-01' as unknown as Date,
    }), { exportedOn: EXPORTED_ON });
    expect(model.metadata.find(field => field.label === 'Review date')?.value)
      .toBe('2026-09-01 (time not recorded)');
  });

  it('labels malformed evidence metadata without coercing arbitrary saved objects to strings', () => {
    const malformed = { toString: 'not a function' };
    const model = buildCsReportModel(createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{ ...REPORT_PATTERNS[0], EvidenceKind: malformed,
          Topics: [{ item: 'Synthetic topic', evidence: { source: malformed, status: malformed } }] }],
      }),
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS, issues: [{ ...REPORT_INSTRUCTIONS.issues[0], coverage: malformed }],
      }),
    }));
    expect(JSON.stringify(model.patterns[0].items)).toContain('unavailable');
    expect(model.counts.total).toBe(2);
  });

  it('keeps unknown check names from injecting nonnumeric severity counters', () => {
    const model = buildCsReportModel(createReportReview({
      stageBOutput: JSON.stringify({ Patterns: [{ ...REPORT_PATTERNS[0], PatternName: 'constructor' }] }),
    }));
    const total = Object.values(model.counts.severity).reduce((sum, count) => sum + count, 0);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBe(model.counts.total);
  });
});
