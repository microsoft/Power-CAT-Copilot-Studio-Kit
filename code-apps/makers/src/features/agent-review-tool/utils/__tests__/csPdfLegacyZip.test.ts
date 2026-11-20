import { describe, expect, it } from 'vitest';
import type { Pattern } from '../../contracts/StageOutputs';
import { buildCsReportModel } from '../csReportModel';
import { generateCsPdfReport } from '../csPdfUtils';
import { projectSavedStandardReview } from '../standardReviewProjection';
import { transformPatternsForDisplay } from '../transformUtils';
import { createReportReview, EXPORTED_ON, pdfPageText } from './csPdfFixtures';

function testCoveragePattern(Status: boolean, AssessmentStatus?: Pattern['AssessmentStatus']): Pattern {
  return {
    PatternId: 'legacy-test-coverage', PatternName: 'Inadequate Test Cases', Status, AssessmentStatus,
    Description: 'The saved test coverage check.', Recommendation: 'Inspect test coverage in its source context.',
    Topics: [{
      item: 'Historical ZIP topic', variable: 'recordedVariable',
      current: 'Original saved detail', suggested: 'Original saved suggestion',
    }],
  };
}

function legacyReview(pattern: Pattern, sourceEnvironment: string | undefined = 'zip') {
  return createReportReview({
    sourceEnvironment, assessmentPolicyVersion: undefined, scoreState: undefined,
    patternScoreApplicable: undefined, instructionScoreApplicable: undefined, overallScoreApplicable: undefined,
    patternScore: 0, instructionScore: 61, overallScore: 31,
    stageAOutput: JSON.stringify({ source: 'zip', topics: [], tools: [], topicComponents: [] }),
    stageBOutput: JSON.stringify({ Patterns: [pattern] }),
    stageCOutput: JSON.stringify({ compliancePercentage: 95, issues: [] }),
  });
}

describe('legacy ZIP test-coverage display compatibility', () => {
  it.each([false, true])('shows legacy boolean %s as N/A without changing stored scores or booleans', Status => {
    const pattern = testCoveragePattern(Status);
    const review = legacyReview(pattern);
    const before = JSON.stringify(review);
    const report = buildCsReportModel(review);
    const projection = projectSavedStandardReview(review);
    const ui = transformPatternsForDisplay([pattern], projection.isZipSource)[0];
    expect(report.patterns[0].status).toBe('not-applicable');
    expect(report.patterns[0].status).toBe(ui.assessmentStatus);
    expect(report.counts.failedCheckCategories).toBe(0);
    expect(report.counts.severity.Medium).toBe(0);
    expect(report.scores).toMatchObject({ pattern: 0, instruction: 61, overall: 31, legacy: true });
    expect(JSON.stringify(report.patterns[0].fields)).toContain('environment-scoped');
    expect(JSON.stringify(report.patterns[0].items)).toContain('Original saved detail');
    expect(JSON.stringify(review)).toBe(before);
  });

  it.each(['pass', 'fail', 'not-assessed', 'not-applicable'] as const)(
    'does not override an explicitly saved %s assessment', status => {
      const report = buildCsReportModel(legacyReview(testCoveragePattern(false, status)));
      expect(report.patterns[0].status).toBe(status);
      expect(report.counts.failedCheckCategories).toBe(status === 'fail' ? 1 : 0);
    },
  );

  it('uses the same trusted ZIP-source fallback as the UI projection', () => {
    const review = legacyReview(testCoveragePattern(false));
    review.sourceEnvironment = undefined;
    const report = buildCsReportModel(review);
    expect(projectSavedStandardReview(review).isZipSource).toBe(true);
    expect(report.patterns[0].status).toBe('not-applicable');
  });

  it('does not apply a ZIP override when the saved root explicitly identifies a live source', () => {
    const review = legacyReview(testCoveragePattern(false), 'https://environment.example.invalid');
    const report = buildCsReportModel(review);
    expect(projectSavedStandardReview(review).isZipSource).toBe(false);
    expect(report.patterns[0].status).toBe('fail');
    expect(report.counts.failedCheckCategories).toBe(1);
    expect(report.metadata.find(field => field.label === 'Source')?.value).toBe('Live environment snapshot');
  });

  it('renders N/A, retains item details, and repeats the saved zero score in the PDF', async () => {
    const blob = await generateCsPdfReport(legacyReview(testCoveragePattern(false)), { exportedOn: EXPORTED_ON });
    const output = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    const text = pdfPageText(output).join(' ');
    expect(text.includes('Status: N/A | Pattern inherent severity: Medium')).toBe(true);
    expect(text.includes('Failed check categories: 0')).toBe(true);
    expect(text.includes('environment-scoped')).toBe(true);
    expect(text.includes('Historical ZIP topic')).toBe(true);
    expect(text.includes('recordedVariable')).toBe(true);
    expect(text.match(/Pattern score: 0 \/ 100/g)).toHaveLength(2);
  });
});
