import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsReportModel } from '../csReportModel';
import { generateCsPdfReport } from '../csPdfUtils';
import { createReportReview, EXPORTED_ON, pdfPageText, REPORT_INSTRUCTIONS, REPORT_PATTERNS } from './csPdfFixtures';

const samples = [
  {
    name: 'ar09-mixed', publicSafe: false,
    review: createReportReview({
      stageBOutput: JSON.stringify({
        policyVersion: 'standard-review-2',
        Patterns: REPORT_PATTERNS.map((pattern, index) => index ? pattern : {
          ...pattern, Description: 'Two input references were saved; one description absence is confirmed.',
          Topics: pattern.Topics.map((topic, itemIndex) => ({
            ...topic, schemaName: 'synthetic.topic.alpha',
            assessmentStatus: itemIndex === 0 ? 'fail' : 'not-assessed',
            assessmentReason: itemIndex === 0 ? 'The saved input description is empty.'
              : 'The existing region text is retained. This reference was not assessed.',
          })),
        }),
      }),
    }),
  },
  {
    name: 'ar09-public-safe',
    publicSafe: true,
    review: createReportReview({
      botName: 'PRIVATE_AGENT_LABEL', agentVersion: 'C:\\PRIVATE_SOURCE\\agent.yaml',
      sourceEnvironment: 'https://PRIVATE_ENVIRONMENT.example.invalid',
      reviewedBy: 'PRIVATE_REVIEWER_LABEL',
      stageBOutput: JSON.stringify({
        policyVersion: 'standard-review-2',
        assessmentNotes: ['PRIVATE_ASSESSMENT_NOTE'],
        Summary: 'Original narrative: 999 failures for PRIVATE_AGENT_LABEL.',
        Patterns: [{
          ...REPORT_PATTERNS[0], Description: 'PRIVATE_FINDING_DESCRIPTION',
          PatternName: 'PRIVATE_TITLE for OrchidExampleServices at portal.example.invalid',
          Recommendation: 'PRIVATE_RECOMMENDATION for reviewer@example.invalid',
          Topics: [{
            item: 'PRIVATE_TOPIC', variable: 'PRIVATE_VARIABLE', current: 'PRIVATE_VALUE',
            suggested: 'PRIVATE_SUGGESTION', componentId: 'PRIVATE_COMPONENT',
            schemaName: 'PRIVATE_SCHEMA', assessmentStatus: 'fail', assessmentReason: 'PRIVATE_SETTING_REASON',
            setting: 'C:\\PRIVATE_SOURCE\\setting.yaml',
            evidence: { source: 'configuration', status: 'verified', quote: 'PRIVATE_QUOTE', reason: 'PRIVATE_REASON' },
          }, {
            item: 'PRIVATE_SECOND_TOPIC', variable: 'PRIVATE_SECOND_VARIABLE', current: 'PRIVATE_SECOND_VALUE',
            suggested: 'PRIVATE_SECOND_SUGGESTION', componentId: 'PRIVATE_SECOND_COMPONENT',
            schemaName: 'PRIVATE_SECOND_SCHEMA', assessmentStatus: 'not-assessed', assessmentReason: 'PRIVATE_SECOND_REASON',
          }],
        }],
      }),
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        summary: 'Original narrative: 999 failures for PRIVATE_AGENT_LABEL.',
        issues: REPORT_INSTRUCTIONS.issues.map(issue => ({
          ...issue, title: 'PRIVATE_TITLE for OrchidExampleServices',
          description: 'PRIVATE_DESCRIPTION repeats portal.example.invalid',
          recommendation: 'PRIVATE_RECOMMENDATION repeats reviewer@example.invalid',
        })),
      }),
    }),
  },
  {
    name: 'ar09-long-multilingual',
    publicSafe: false,
    review: createReportReview({
      botName: 'Synthetic multilingual review — Français Español Português / 東京 / العربية / 😀',
      stageBOutput: JSON.stringify({
        policyVersion: 'standard-review-2',
        Patterns: [{
          ...REPORT_PATTERNS[0],
          Description: 'This long saved finding explains a configuration limitation without claiming a runtime failure. '.repeat(90),
          Topics: Array.from({ length: 12 }, (_, index) => ({
            item: `Synthetic topic ${index + 1}`,
            variable: `input_${index + 1}_${index === 3 ? 'W'.repeat(1000) : 'value'}`,
            componentId: `synthetic-component-${index + 1}`,
            setting: `inputs.input_${index + 1}.description`,
            current: `Français Español Português. 東京. Saved value ${index + 1}.\n\n` + 'A reviewed description. '.repeat(8),
            suggested: 'Describe the value, valid input shape and intended use. '.repeat(4),
            evidence: {
              source: 'configuration', status: 'verified',
              quote: `Saved value ${index + 1}.`, reason: 'This value was included in the saved snapshot.',
            },
          })),
        }],
      }),
    }),
  },
  {
    name: 'ar09-sparse-malformed',
    publicSafe: false,
    review: createReportReview({
      agentVersion: undefined, reviewedBy: undefined, sourceEnvironment: undefined, stageAOutput: undefined,
      stageBOutput: JSON.stringify({
        Patterns: [REPORT_PATTERNS[0], null, { PatternName: 'Incomplete check' }],
      }),
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS, issues: [REPORT_INSTRUCTIONS.issues[0], null],
      }),
    }),
  },
  {
    name: 'ar09-legacy',
    publicSafe: false,
    review: createReportReview({
      assessmentPolicyVersion: undefined, scoreState: undefined,
      patternScoreApplicable: undefined, instructionScoreApplicable: undefined, overallScoreApplicable: undefined,
      stageAOutput: undefined, sourceEnvironment: undefined, agentVersion: undefined,
      patternScore: 0, instructionScore: 13, overallScore: 7,
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[3], Status: false, AssessmentStatus: undefined, AssessmentReason: undefined,
          Topics: [
            { item: 'Legacy topic Alpha', variable: 'query', current: 'Shared phrase A', suggested: 'Specific task A' },
            { item: 'Legacy topic Beta', variable: 'query', current: 'Shared phrase B', suggested: 'Specific task B' },
          ],
        }],
      }),
      stageCOutput: JSON.stringify({
        compliancePercentage: 95, summary: 'An original narrative with stale counts.',
        issues: [{
          id: 'scope-definition-legacy', title: 'Legacy scope finding', severity: 'Low',
          description: 'The saved finding describes a scope limit.',
          recommendation: 'Clarify the supported scope.',
        }],
      }),
    }),
  },
  {
    name: 'ar09-legacy-zip',
    publicSafe: false,
    review: createReportReview({
      assessmentPolicyVersion: undefined, scoreState: undefined, agentVersion: undefined,
      patternScoreApplicable: undefined, instructionScoreApplicable: undefined, overallScoreApplicable: undefined,
      sourceEnvironment: 'zip', patternScore: 0, instructionScore: 100, overallScore: 50,
      highSeverityCount: 0, mediumSeverityCount: 1, lowSeverityCount: 0, totalIssueCount: 1,
      stageAOutput: JSON.stringify({ source: 'zip', topics: [], tools: [], topicComponents: [] }),
      stageBOutput: JSON.stringify({
        Patterns: [{
          PatternId: 'legacy-test-coverage', PatternName: 'Inadequate Test Cases', Status: false,
          Description: 'The saved legacy test-coverage finding.',
          Recommendation: 'Inspect coverage in the appropriate source context.',
          Topics: [{ item: 'Synthetic ZIP snapshot', current: 'Original saved detail',
            suggested: 'Review coverage using the live source.' }],
        }],
      }),
      stageCOutput: JSON.stringify({ compliancePercentage: 95, issues: [] }),
    }),
  },
];

describe('synthetic PDF export corpus', () => {
  it.each(samples)('generates $name without source or AI calls', async sample => {
    const blob = await generateCsPdfReport(sample.review, {
      exportedOn: EXPORTED_ON, redactSensitiveValues: sample.publicSafe,
    });
    const bytes = Buffer.from(await blob.arrayBuffer());
    const contents = bytes.toString('latin1');
    expect(contents.startsWith('%PDF-')).toBe(true);
    expect(contents.endsWith('%%EOF')).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const pages = pdfPageText(contents);
    const text = pages.join(' ');
    const model = buildCsReportModel(sample.review, { exportedOn: EXPORTED_ON, redactSensitiveValues: sample.publicSafe });
    const directory = process.env.CS_PDF_SAMPLE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${sample.name}.pdf`);
      await writeFile(path, bytes);
      await writeFile(join(directory, `${sample.name}.fixture.json`), JSON.stringify({
        sample: sample.name,
        state: 'working; see test and inspection results before acceptance',
        review: sample.review,
        options: { exportedOn: EXPORTED_ON, redactSensitiveValues: sample.publicSafe },
        expected: {
          pages: pages.length, scores: model.scores, counts: model.counts, availability: model.availability,
          maxPages: sample.name === 'ar09-mixed' || sample.name === 'ar09-public-safe' ? 13 : undefined,
          patterns: model.patterns, instructionIssues: model.instructionIssues,
          instructionCriteria: model.instructionCriteria,
          fontLimit: 'Helvetica/WinAnsi with explicit Unicode-code fallback; not full multilingual rendering.',
        },
      }, null, 2));
      expect(await readFile(path)).toEqual(bytes);
      console.info(`Synthetic PDF: ${resolve(path)} (${contents.match(/\/Type \/Page\b/g)?.length} pages)`);
    }
    expect(text).toContain('Review date: 2026-09-01 10:00:00 UTC');
    expect(text).toContain('Export date: 2026-09-08 12:00:00 UTC');
    if (!sample.name.startsWith('ar09-legacy')) {
      expect(model.scores).toMatchObject({ overall: 54, pattern: 24, instruction: 61 });
      expect(model.counts).toMatchObject({
        failedCheckCategories: 1, instructionIssues: 1, total: 2,
        severity: { High: 1, Medium: 1, Low: 0, Unspecified: 0 },
      });
    }
    if (sample.name === 'ar09-mixed' || sample.name === 'ar09-public-safe') {
      expect(model.patterns[0].items.map(item => item.status)).toEqual(['fail', 'not-assessed']);
      expect(text).toContain('Recorded settings: 2 | Marked Fail: 1');
      expect(text).toContain('Setting status: Not assessed');
      expect(pages.length).toBeLessThanOrEqual(13);
    }
    if (sample.name === 'ar09-sparse-malformed') {
      expect(text).toContain('Assessment availability: patterns partial; instructions partial.');
      expect(text).not.toMatch(/(?:Pattern|Instruction) assessment data (?:is )?unavailable/);
      expect(text).toContain('Incomplete check');
    }
    if (sample.name === 'ar09-long-multilingual') {
      expect(pages.some(page => /^Recorded setting \d/.test(page))).toBe(false);
      const body = pages.map(page => page
        .replace(/^Pattern check \d+(?: \| Recorded setting \d+)? \(continued\)\s*/, '')
        .replace(/COPILOT STUDIO KIT \| STANDARD AGENT REVIEW/g, '')
        .replace(/Copilot Studio Agent Review \| Page \d+ of \d+$/, '')).join(' ').replace(/\s+/g, ' ');
      expect(body.match(/This long saved finding explains a configuration limitation/g)).toHaveLength(90);
      const reviewedDescriptionCount = body.match(/A reviewed description\./g)?.length ?? 0;
      expect(reviewedDescriptionCount).toBe(96);
      expect(body).not.toContain('[excerpt');
      expect(body.match(/Describe the value, valid input shape and intended use\./g) ?? []).toHaveLength(4);
      expect(body.replace(/\s/g, '')).toContain('input_4_' + 'W'.repeat(1000));
      for (let index = 1; index <= 12; index++) {
        expect(text).toContain(`Topic / resource: Synthetic topic ${index}`);
        expect(text).toContain(`Setting: inputs.input_${index}.description`);
      }
    }
    if (sample.publicSafe) {
      for (const token of ['PRIVATE_', 'OrchidExampleServices', 'portal.example.invalid', 'reviewer@example.invalid']) {
        expect(contents.includes(token), token).toBe(false);
      }
    }
  });
});
