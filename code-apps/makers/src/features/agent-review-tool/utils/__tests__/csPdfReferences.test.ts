import { describe, expect, it } from 'vitest';
import type { AssessmentStatus } from '../../contracts/StageOutputs';
import { buildCsReportModel } from '../csReportModel';
import { generateCsPdfReport } from '../csPdfUtils';
import { createReportReview, EXPORTED_ON, pdfPageText, REPORT_PATTERNS } from './csPdfFixtures';

const confirmed = {
  item: 'Workshop topic', componentId: 'workshop-topic', schemaName: 'synthetic.workshop',
  variable: 'minimumSeats', setting: 'Input variable description', current: '',
  suggested: 'Describe the required number of seats.',
  assessmentStatus: 'fail', assessmentReason: 'This setting has no description.',
  evidence: { source: 'configuration', status: 'verified', quote: '' },
};
const unresolved = {
  item: 'Other workshop', componentId: 'other-workshop', schemaName: 'synthetic.other',
  variable: 'region', current: 'Retained existing text.', suggested: 'Retained proposed text.',
  assessmentStatus: 'not-assessed', assessmentReason: '  This reference was not evaluated.\n',
  evidence: { source: 'configuration', status: 'verified', quote: 'Retained existing text.' },
};

function reviewWithReferences(references: unknown, status: AssessmentStatus = 'fail') {
  return createReportReview({
    stageBOutput: JSON.stringify({
      Patterns: [{
        ...REPORT_PATTERNS[0], Status: status === 'pass', AssessmentStatus: status, Topics: references,
      }],
    }),
  });
}

describe('saved PDF reference outcomes', () => {
  it.each([undefined, {}])('does not invent a recorded reference for an unavailable list: %j', references => {
    const model = buildCsReportModel(reviewWithReferences(references));
    expect(model.patterns[0].items).toEqual([]);
    expect(model.availability.patterns).toBe('partial');
    expect(model.patterns[0].fields.some(field => field.label === 'Setting references')).toBe(true);
  });

  it('withholds text from a malformed reference list in a public-safe report', () => {
    const model = buildCsReportModel(reviewWithReferences('PRIVATE_MALFORMED_LIST'), { redactSensitiveValues: true });
    expect(JSON.stringify(model)).not.toContain('PRIVATE_MALFORMED_LIST');
  });

  it('retains an unresolved reference without promoting its matching text to a failure', () => {
    const model = buildCsReportModel(reviewWithReferences([confirmed, unresolved]));
    expect(model.patterns[0].items.map(item => item.status)).toEqual(['fail', 'not-assessed']);
    expect(model.availability.patterns).toBe('partial');
    expect(model.counts.failedCheckCategories).toBe(1);
    expect(model.scores).toMatchObject({ overall: 54, pattern: 24, instruction: 61 });
    const fields = model.patterns[0].items[1].fields;
    expect(fields.find(field => field.label === 'Schema name')?.value).toBe(unresolved.schemaName);
    expect(fields.find(field => field.label === 'Saved setting assessment reason')?.value).toBe(unresolved.assessmentReason);
    expect(fields.find(field => field.label === 'Reviewed value')?.value).toBe(unresolved.current);
    expect(fields.find(field => field.label === 'Suggested value')?.value).toBe(unresolved.suggested);
  });

  it.each([
    [undefined, 'fail'], ['fail', 'fail'], ['pass', 'pass'],
    ['not-assessed', 'not-assessed'], ['not-applicable', 'not-applicable'],
    ['future-outcome', 'not-assessed'], [false, 'not-assessed'],
  ])('resolves saved reference outcome %s as %s', (assessmentStatus, expected) => {
    const model = buildCsReportModel(reviewWithReferences([{ ...confirmed, assessmentStatus }]));
    expect(model.patterns[0].items[0].status).toBe(expected);
  });

  it.each(['not-assessed', 'not-applicable'] as const)('does not promote a reference beyond a %s parent', status => {
    const model = buildCsReportModel(reviewWithReferences([confirmed], status));
    expect(model.patterns[0].items[0].status).toBe(status);
    expect(model.counts.failedCheckCategories).toBe(0);
  });

  it.each([null, { ...confirmed, assessmentReason: 42 }, { ...confirmed, current: 42 }])(
    'keeps malformed references visible and unassessed: %j', reference => {
      const model = buildCsReportModel(reviewWithReferences([reference]));
      expect(model.patterns[0].items).toHaveLength(1);
      expect(model.patterns[0].items[0].status).toBe('not-assessed');
      expect(model.availability.patterns).toBe('partial');
      expect(JSON.stringify(model.patterns[0].items)).toContain('malformed');
    },
  );

  it('preserves genuine historical-reference fallback without requiring modern item metadata', () => {
    const model = buildCsReportModel(reviewWithReferences([{
      item: 'Legacy workshop', current: 'Saved value.', assessmentReason: 'Saved context.',
    }]));
    expect(model.patterns[0].items[0].status).toBe('fail');
    expect(model.counts.failedCheckCategories).toBe(1);
  });

  it('retains statuses in a public-safe report while withholding source names and reasons', () => {
    const model = buildCsReportModel(reviewWithReferences([{
      ...unresolved, schemaName: 'PRIVATE_SCHEMA', assessmentReason: 'PRIVATE_REASON',
    }]), { redactSensitiveValues: true });
    expect(model.patterns[0].items[0].status).toBe('not-assessed');
    expect(JSON.stringify(model)).not.toContain('PRIVATE_');
    expect(JSON.stringify(model.patterns[0].items)).toContain('Omitted for public-safe export');
  });

  it.each([false, true])('renders each recorded setting outcome and only the failed-setting count (public-safe: %s)', async publicSafe => {
    const blob = await generateCsPdfReport(reviewWithReferences([confirmed, unresolved]), {
      exportedOn: EXPORTED_ON, redactSensitiveValues: publicSafe,
    });
    const text = pdfPageText(Buffer.from(await blob.arrayBuffer()).toString('latin1')).join(' ');
    expect(text).toContain('Recorded settings: 2 | Marked Fail: 1');
    expect(text).toContain('Recorded setting 1');
    expect(text).toContain('Recorded setting 2');
    expect(text).toContain('Setting status: Fail');
    expect(text).toContain('Setting status: Not assessed');
    expect(text).toContain('Failed check categories: 1');
    if (!publicSafe) {
      expect(text).toContain('This reference was not evaluated.');
      expect(text).toContain('Retained existing text.');
      expect(text).toContain('Retained proposed text.');
    }
  });
});
