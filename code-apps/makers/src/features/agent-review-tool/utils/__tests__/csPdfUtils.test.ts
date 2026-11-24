import { describe, expect, it } from 'vitest';
import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import { buildCsReportModel, CS_REPORT_REFERENCES } from '../csReportModel';
import { generateCsPdfReport } from '../csPdfUtils';
import { createReportReview, EXPORTED_ON, pdfPageText, REPORT_INSTRUCTIONS, REPORT_PATTERNS } from './csPdfFixtures';

async function reportText(review = createReportReview(), redactSensitiveValues = false): Promise<string> {
  const blob = await generateCsPdfReport(review, { exportedOn: EXPORTED_ON, redactSensitiveValues });
  return Buffer.from(await blob.arrayBuffer()).toString('latin1');
}

describe('saved standard review PDF accuracy', () => {
  it.each([false, true])('keeps the fixed assessment scope beside scores and in limits (public-safe: %s)', async publicSafe => {
    const pages = pdfPageText(await reportText(createReportReview(), publicSafe));
    const summary = pages.find(page => page.includes('Saved review scores'));
    const limits = pages.find(page => page.includes('Assessment scope and limits'));
    for (const page of [summary, limits]) {
      expect(page).toContain('Static authoring checks of the saved configuration and instructions');
      expect(page).toContain('The score is not a conversation success rate.');
      expect(page).toContain('does not assess answer accuracy, response time, access-control effectiveness, or production readiness.');
    }
  });

  it('uses the authoritative saved instruction score in both summary and instruction section', async () => {
    const text = await reportText();
    expect(text.match(/61 \/ 100/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text).not.toContain('98%');
    expect(text).toContain('24 / 100');
    expect(text).toContain('54 / 100');
  });

  it('matches saved scores, finding counts, review date, and complete long values', async () => {
    const longValue = `BEGIN_LONG_REVIEWED_VALUE ${'Retain this saved instruction sentence. '.repeat(80)}END_LONG_REVIEWED_VALUE`;
    const failedPatterns = [0, 1].map(index => ({
      ...REPORT_PATTERNS[0],
      PatternId: `issue-875-fail-${index + 1}`,
      PatternName: `Issue 875 failed check ${index + 1}`,
      Topics: [{
        ...REPORT_PATTERNS[0].Topics[0],
        item: `Issue 875 topic ${index + 1}`,
        current: index === 0 ? longValue : 'Second saved value.',
        evidence: {
          source: 'configuration' as const,
          status: 'verified' as const,
          quote: index === 0 ? longValue : 'Second saved value.',
          reason: 'The saved value was verified.',
        },
      }],
    }));
    const passedPatterns = [0, 1].map(index => ({
      ...REPORT_PATTERNS[1],
      PatternId: `issue-875-pass-${index + 1}`,
      PatternName: `Issue 875 passed check ${index + 1}`,
    }));
    const review = createReportReview({
      overallScore: 75,
      patternScore: 50,
      instructionScore: 100,
      reviewedOn: new Date('2026-09-03T15:30:00Z'),
      stageBOutput: JSON.stringify({
        policyVersion: 'standard-review-2',
        Patterns: [...failedPatterns, ...passedPatterns],
      }),
      stageCOutput: JSON.stringify({
        compliancePercentage: 100,
        policyVersion: 'standard-review-2',
        issues: [],
        criterionAssessments: COMPLIANCE_CRITERIA.map(criterion => ({
          criteriaId: criterion.id,
          status: 'pass',
        })),
      }),
    });

    const text = pdfPageText(await reportText(review)).join(' ');
    expect(text).toContain('Overall score: 75 / 100');
    expect(text).toContain('Pattern score: 50 / 100');
    expect(text).toContain('Instruction score: 100 / 100');
    expect(text).toContain('Total counted findings: 2');
    expect(text).toContain('Counts describe included detail rows only, not affected topics or variables.');
    expect(text).toContain('Review date: 2026-09-03 15:30:00 UTC');
    expect(text).toContain('BEGIN_LONG_REVIEWED_VALUE');
    expect(text).toContain('END_LONG_REVIEWED_VALUE');
  });

  it('reconciles severity totals with failed categories and assessed instruction issues only', async () => {
    const text = await reportText();
    expect(text).toContain('Failed check categories: 1');
    expect(text).toContain('Instruction issues counted: 1');
    expect(text).toContain('High: 1');
    expect(text).toContain('Medium: 1');
    expect(text).toContain('Low: 0');
    expect(text).not.toContain('99 failures');
  });

  it('labels stored instruction severity separately and never counts criterion severity as another issue', async () => {
    const text = pdfPageText(await reportText(createReportReview({
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        issues: [{ ...REPORT_INSTRUCTIONS.issues[0], severity: 'Low' }],
      }),
    }))).join(' ');
    expect(text.includes('Stored issue severity: Low')).toBe(true);
    expect(text.includes('Criterion inherent severity: High')).toBe(true);
    expect(text.includes('High: 0 | Medium: 1 | Low: 1')).toBe(true);
    expect(text.includes('Instruction issues counted: 1')).toBe(true);
    expect(text.includes('Pattern inherent severity: Medium')).toBe(true);
  });

  it('retains every affected variable, reviewed value, suggestion and evidence identity', async () => {
    const text = pdfPageText(await reportText()).join(' ');
    for (const value of [
      'requestId', 'locale', 'Region value',
      'inputs.requestId.description', 'The setting is present and empty.',
      'The identifier supplied with the request.', 'Handle service requests.',
    ]) expect(text).toContain(value);
    expect(text).toContain('Empty value');
  });

  it('retains both sides of overlap rather than collapsing topic names', async () => {
    const text = await reportText(createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[3], AssessmentStatus: 'fail',
          Topics: [
            { item: 'Topic Alpha', componentId: 'component-alpha', current: 'Shared phrase A', suggested: 'Specific task A' },
            { item: 'Topic Beta', componentId: 'component-beta', current: 'Shared phrase B', suggested: 'Specific task B' },
          ],
        }],
      }),
    }));
    for (const value of [
      'Topic Alpha', 'Shared phrase A', 'Specific task A',
      'Topic Beta', 'Shared phrase B', 'Specific task B',
    ]) expect(text).toContain(value);
  });

  it.each([
    { stageBOutput: '{invalid', stageCOutput: 'null' },
    { stageBOutput: undefined, stageCOutput: undefined },
  ])('makes unavailable stage data visible without a false successful assessment: %o', async stages => {
    const text = await reportText(createReportReview(stages));
    expect(text).toContain('Pattern assessment data unavailable');
    expect(text).toContain('Instruction assessment data unavailable');
    expect(text).not.toContain('No compliance issues found');
  });

  it('labels parseable but unusable lists as partial, not missing or unreadable whole stages', async () => {
    const pages = pdfPageText(await reportText(createReportReview({
      stageBOutput: JSON.stringify({ Patterns: {} }),
      stageCOutput: JSON.stringify({ issues: 'invalid' }),
    })));
    const text = pages.join(' ');
    expect(text).toContain('Assessment availability: patterns partial; instructions partial.');
    expect(text).toContain('Pattern assessment is partial');
    expect(text).toContain('Instruction assessment is partial');
    expect(text).not.toMatch(/(?:Pattern|Instruction) assessment data (?:is )?unavailable/);
    expect(text).not.toContain('No compliance issues found');
    expect(text).toContain('Not assessed');
  });

  it('separates review date from export date and includes available provenance and official links', async () => {
    const text = pdfPageText(await reportText()).join(' ');
    expect(text).toContain('Review date: 2026-09-01 10:00:00 UTC');
    expect(text).toContain('Export date: 2026-09-08 12:00:00 UTC');
    expect(text).toContain('standard-review-2');
    expect(text).toContain('2026-08-31T09:00:00Z');
    expect(text).toContain('https://learn.microsoft.com/');
    expect(text).toContain('metadata was unavailable');
  });

  it('uses the partner-report hierarchy and keeps contextual maker guidance', async () => {
    const pages = pdfPageText(await reportText());
    const text = pages.join(' ');
    const headings = [
      'Executive summary',
      'Review scope',
      'Pattern assessment',
      'Instruction assessment',
      'Recommended implementation order',
      'Assessment scope and limits',
      'Official references',
    ];

    expect(pages[0]).toContain('Synthetic Service Agent Review');
    expect(pages[0]).toContain('Synthetic Service Agent');
    expect(headings.map(heading => text.indexOf(heading)))
      .toEqual([...headings.map(heading => text.indexOf(heading))].sort((a, b) => a - b));
    for (const value of [
      '36 topics',
      '9 tools and agents',
      '0 knowledge sources',
      'Describe the identifier and its expected format.',
      'Unique request identifier supplied by the calling topic.',
      'A maker can select the correct value without opening the topic.',
      'synthetic-job',
      'synthetic-correlation',
    ]) {
      expect(text).toContain(value);
    }
  });

  it('renders the accepted contents, finding contract, check tables, and validation record', async () => {
    const pages = pdfPageText(await reportText());
    const text = pages.join(' ');

    expect(pages[1]).toContain('Contents');
    for (const section of [
      'Executive summary',
      'Review scope',
      'Pattern review',
      'Instruction review',
      'Recommended implementation order',
      'Tests to run after changes',
      'All pattern checks',
      'All instruction criteria',
      'Validation record and limits',
      'Official references',
    ]) {
      expect(pages[1]).toContain(section);
    }
    expect(text).not.toContain('False-positive controls');
    expect(text).not.toContain('Workflow findings must use a registered rule');

    expect(text).toContain('Score calculations');
    expect(text).toContain('Pattern calculation:');
    expect(text).toContain('Instruction calculation:');
    expect(text).toContain('Overall calculation:');
    expect(text).toContain('P-01 - Missing Input Variable Description');
    expect(text).toContain('I-01 - Supported request scope is not explicit');
    expect(text).toContain('Pattern: Missing Input Variable Description');
    expect(text).toContain('Criterion: Scope Definition');
    expect(text).toContain('Affected component: Topic Alpha');
    expect(text).toContain('Where to change: inputs.requestId.description');
    expect(text).toContain('Current text: Empty value (saved as empty text)');
    expect(text).toContain('Why it matters: The maker cannot confirm what value should be supplied.');
    expect(text).toContain('Maker action: Describe the identifier and its expected format.');
    expect(text).toContain('Suggested text: Unique request identifier supplied by the calling topic.');
    expect(text).toContain('Acceptance check: A maker can select the correct value without opening the topic.');
    expect(text).toContain('Official references');
    expect(text).toContain('Validation record and limits');
    expect(pages.slice(1).every(page =>
      page.includes('Synthetic Service Agent Review')
      && page.includes('Actionable maker report')
      && /Page \d+ of \d+/.test(page))).toBe(true);
  });

  it('uses the accepted report visual template without dropping actionable content', async () => {
    const raw = await reportText();
    const pages = pdfPageText(raw);
    const text = pages.join(' ');

    expect(raw).toContain('79.3700787401574814 785.1970866141731449 m');
    expect(raw).toContain('/Subtype /Image');
    expect(pages[0]).toContain('Synthetic Service Agent Review');
    expect(pages[0]).toContain('Verified actionable findings from the saved Standard review');
    expect(text).toContain('Tests to run after changes');

    for (const colorOperator of [
      '0.07 0.23 0.35 rg',
      '0.06 0.42 0.74 rg',
      '1. 0.95 0.95 rg',
      '0.77 0.06 0.12 rg',
      '0.93 0.96 0.99 rg',
      '0.78 0.82 0.86 RG',
      '0.96 0.97 0.98 rg',
    ]) {
      expect(raw, colorOperator).toContain(colorOperator);
    }

    for (const requiredContent of [
      'P-01 - Missing Input Variable Description',
      'I-01 - Supported request scope is not explicit',
      'Maker action: Describe the identifier and its expected format.',
      'Suggested text: Unique request identifier supplied by the calling topic.',
      'Acceptance check: A maker can select the correct value without opening the topic.',
      'All pattern checks',
      'All instruction criteria',
      'Workflow validation record',
      'Assessment scope and limits',
      'Official references',
    ]) {
      expect(text).toContain(requiredContent);
    }
  });

  it('labels each continued implementation-order page', async () => {
    const patterns = Array.from({ length: 40 }, (_, index) => ({
      ...REPORT_PATTERNS[0],
      PatternId: `implementation-order-${index + 1}`,
      PatternName: `Implementation priority ${index + 1}`,
      Description: `Synthetic finding ${index + 1}.`,
      Topics: [{
        ...REPORT_PATTERNS[0].Topics[0],
        remediation: {
          ...REPORT_PATTERNS[0].Topics[0].remediation!,
          findingTitle: `Resolve synthetic routing issue ${index + 1} with a clear, deterministic, and verifiable maker action before publishing`,
        },
      }],
    }));
    const pages = pdfPageText(await reportText(createReportReview({
      stageBOutput: JSON.stringify({ Patterns: patterns }),
    })));
    const start = pages.findIndex((page, index) =>
      index > 1 && page.includes('Recommended implementation order'));
    const end = pages.findIndex((page, index) => index >= start && page.includes('All pattern checks'));
    const orderPages = pages
      .slice(start, end + 1)
      .filter(page => /\d+\. P-\d{2} -/.test(page));

    expect(orderPages.length).toBeGreaterThan(1);
    expect(orderPages.slice(1).every(page =>
      page.includes('Recommended implementation order (continued)'))).toBe(true);
  });

  it('removes contextual free text and direct workflow identifiers from public-safe reports', async () => {
    const text = await reportText(createReportReview(), true);
    for (const value of [
      'Describe the identifier and its expected format.',
      'Unique request identifier supplied by the calling topic.',
      'A maker can select the correct value without opening the topic.',
      'synthetic-job',
      'synthetic-correlation',
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it.each([undefined, new Date('invalid')])('prints an unavailable historical date rather than today: %s', async reviewedOn => {
    const text = pdfPageText(await reportText(createReportReview({ reviewedOn }))).join(' ');
    expect(text).toContain('Review date: Unavailable');
    expect(text).toContain('Export date: 2026-09-08 12:00:00 UTC');
    expect(text).not.toContain('Review date: 2026-09-08');
  });

  it('redacts source and reviewed values without removing findings or changing saved scores', async () => {
    const review = createReportReview({
      botName: 'PRIVATE_AGENT_NAME', sourceEnvironment: 'https://private.example.invalid',
      agentVersion: 'C:\\private\\source\\agent.yaml',
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0], Description: 'See C:\\private\\source\\agent.yaml.',
          Topics: [{ item: 'PRIVATE_TOPIC', variable: 'PRIVATE_VARIABLE', current: 'PRIVATE_CURRENT',
            suggested: 'PRIVATE_SUGGESTION', componentId: 'PRIVATE_COMPONENT', setting: 'PRIVATE_SETTING',
            evidence: { source: 'configuration', status: 'verified', quote: 'PRIVATE_QUOTE',
              reason: 'See C:\\private\\source\\agent.yaml.' } }],
        }],
      }),
    });
    const text = await reportText(review, true);
    expect(text).not.toContain('PRIVATE_');
    expect(text).not.toContain('private.example');
    expect(text).not.toContain('private');
    expect(text).toContain('Omitted for public-safe export');
    expect(text).toContain('Failed check categories: 1');
    expect(text).toContain('Instruction issues counted: 1');
    expect(text).toContain('61 / 100');
  });

  it('keeps verbose saved diagnostic context out of the actionable report', async () => {
    const pages = pdfPageText(await reportText(createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{ ...REPORT_PATTERNS[0], Description: 'Long detailed description. '.repeat(1800) }],
      }),
    })));
    const text = pages.join(' ');
    expect(pages.length).toBeLessThanOrEqual(13);
    expect(text).not.toContain('Long detailed description.');
    expect(text).toContain('requestId');
  });

  it('preserves supported accents and labels the fallback for unsupported scripts in actual PDF output', async () => {
    const text = await reportText(createReportReview({ botName: 'Français Español Português 東京 😀' }));
    expect(text).toContain('Français Español Português');
    expect(text).toContain('[U+6771][U+4EAC]');
    expect(text).toContain('[U+1F600]');
    expect(text).toContain('Unicode code points');
  });

  it('summarizes non-failing patterns and retains their saved check outcome', async () => {
    const text = pdfPageText(await reportText(createReportReview({
      stageBOutput: JSON.stringify({ Patterns: [REPORT_PATTERNS[2]] }),
    }))).join(' ');
    expect(text).toContain('1 non-failing or unassessed pattern check(s)');
    expect(text).toContain('P-01 | N/A | Pattern inherent severity: High | Missing Model Name');
    expect(text).toContain('This event topic is not selected by the model.');
  });

  it('keeps each reference title and URL together, without a URL-only last page', async () => {
    const pages = pdfPageText(await reportText());
    for (const reference of CS_REPORT_REFERENCES) {
      expect(pages.filter(page => page.includes(reference.title) && page.includes(reference.url))).toHaveLength(1);
    }
  });

  it('keeps each compact criterion status and severity on one page', async () => {
    const review = createReportReview({
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        criterionAssessments: REPORT_INSTRUCTIONS.criterionAssessments?.map(assessment => ({
          ...assessment, reason: `Saved reason for ${assessment.criteriaId}.`,
        })),
      }),
    });
    const pages = pdfPageText(await reportText(review));
    const model = buildCsReportModel(review, { exportedOn: EXPORTED_ON });
    for (const [index, row] of model.instructionCriteria.entries()) {
      const identifier = `I-${String(index + 1).padStart(2, '0')} |`;
      const page = pages.find(value => value.includes(identifier));
      expect(page, row.title).toContain(row.title);
      expect(page, row.title).toContain(`Criterion inherent severity: ${row.severity}`);
      if (row.status === 'not-assessed' || row.status === 'not-applicable') {
        expect(page, row.title).toContain(`Saved reason for ${COMPLIANCE_CRITERIA[index].id}.`);
      }
    }
  });

  it('compacts technical metadata while retaining actionable fields and complete check outcomes', async () => {
    const review = createReportReview();
    const pages = pdfPageText(await reportText(review));
    const text = pages.join(' ');
    expect(pages.length).toBeLessThanOrEqual(13);
    expect(text).toContain('Not recorded:');
    expect(text).not.toContain('Finding: Not recorded');
    for (const value of [
      'Request identifier purpose is missing',
      'Describe the identifier and its expected format.',
      'Unique request identifier supplied by the calling topic.',
      'A maker can select the correct value without opening the topic.',
      'Topic / resource: Topic Alpha',
      'Variable: requestId',
      'All pattern checks',
      'All instruction criteria',
    ]) expect(text).toContain(value);
    expect(text).not.toContain('Component ID: component-alpha');
    expect(text).not.toContain('Saved check ID: input-descriptions');
  });

  it('does not mistake literal reviewed text for a missing-field or redaction marker', async () => {
    const review = createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0],
          Topics: [{
            item: 'Literal marker topic', variable: 'marker',
            current: 'Not recorded', suggested: 'Omitted for public-safe export',
            evidence: { source: 'configuration', status: 'verified', quote: 'Not recorded' },
          }],
        }],
      }),
    });
    const text = pdfPageText(await reportText(review)).join(' ');
    expect(text).toContain('Suggested text: Omitted for public-safe export');
    expect(text).toContain('Evidence quote: Not recorded');
  });

  it('retains a saved setting-level reason and redacts it without changing category counts', async () => {
    const review = createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0],
          Topics: [{ ...REPORT_PATTERNS[0].Topics[0], assessmentReason: 'PRIVATE_SETTING_REASON remains saved context.' }],
        }],
      }),
    });
    const full = pdfPageText(await reportText(review)).join(' ');
    const publicSafe = pdfPageText(await reportText(review, true)).join(' ');
    expect(full).toContain('Saved setting assessment reason: PRIVATE_SETTING_REASON remains saved context.');
    expect(publicSafe).not.toContain('PRIVATE_SETTING_REASON');
    for (const output of [full, publicSafe]) {
      expect(output).toContain('Failed check categories: 1');
      expect(output).toContain('Pattern score: 24 / 100');
    }
  });

  it('keeps long identities, suggestions, and saved evidence without truncation', async () => {
    const repeated = 'RETAIN_EVERY_REVIEWED_SENTENCE. ';
    const review = createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0],
          Topics: [{
            item: 'Topic Alpha', variable: 'input_' + 'W'.repeat(1000),
            current: repeated.repeat(450),
            suggested: 'FINAL_SUGGESTION_RETAINED ' + 'Describe the validated replacement. '.repeat(40),
          }],
        }],
      }),
    });
    const pages = pdfPageText(await reportText(review));
    const evidencePages = pages.filter(page => page.includes('RETAIN_EVERY_REVIEWED_SENTENCE.'));
    expect(evidencePages.length).toBeGreaterThan(1);
    const text = pages.join(' ');
    const retainedSentences = text.match(/RETAIN_EVERY_REVIEWED_SENTENCE\./g) ?? [];
    expect(retainedSentences).toHaveLength(450);
    expect(text).not.toContain('[excerpt');
    expect(text).toContain('Current text: RETAIN_EVERY_REVIEWED_SENTENCE.');
    expect(text).toContain('Suggested text: FINAL_SUGGESTION_RETAINED');
    expect(text.replace(/\s/g, '')).toContain('input_' + 'W'.repeat(1000));
    expect(text).toContain('FINAL_SUGGESTION_RETAINED');
    expect(text.match(/Describe the validated replacement\./g)).toHaveLength(40);
  });

  it('states the current condition when a failed finding records an empty setting or missing guidance', async () => {
    const patternItem = REPORT_PATTERNS[0].Topics[0];
    const instructionIssue = REPORT_INSTRUCTIONS.issues[0];
    const review = createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0],
          Topics: [{
            item: patternItem.item,
            variable: patternItem.variable,
            setting: patternItem.setting,
            evidence: {
              source: 'configuration',
              status: 'verified',
              reason: 'This declared setting has no readable nonblank text in the reviewed configuration.',
            },
            remediation: patternItem.remediation,
          }],
        }],
      }),
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        issues: [{
          ...instructionIssue,
          evidence: {
            source: 'instructions',
            status: 'unverified',
            reason: 'The complete instruction field was reviewed. Missing guidance has no exact quotation.',
          },
        }],
      }),
    });
    const text = pdfPageText(await reportText(review)).join(' ');
    expect(text.includes('Current text: Blank in the reviewed configuration.')).toBe(true);
    expect(text.includes(
      'Current text: No matching guidance was found in the reviewed instructions; '
      + 'this finding records an omission, so no exact quote is available.',
    )).toBe(true);
  });

  it('keeps a recorded-settings summary with the first recorded setting', async () => {
    const longText = 'Synthetic routing evidence. '.repeat(5);
    const review = createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0],
          PatternName: 'Overlapping Topic Descriptions',
          Topics: Array.from({ length: 4 }, (_, index) => ({
            item: `Synthetic route ${index + 1}`,
            setting: 'Selection description',
            current: `${index + 1}: ${longText}`,
            suggested: `${index + 1}: Use a mutually exclusive routing boundary. ${longText}`,
            evidence: {
              source: 'configuration',
              status: 'verified',
              quote: `${index + 1}: ${longText}`,
              reason: 'The saved setting and evidence identity match.',
            },
            remediation: {
              findingTitle: 'Routing descriptions overlap',
              whyItMatters: longText,
              makerAction: longText,
              suggestedText: longText,
              acceptanceCheck: longText,
            },
          })),
        }],
      }),
    });
    const pages = pdfPageText(await reportText(review));
    const summaryPage = pages.find(page => page.includes('Recorded settings: 4 | Marked Fail: 4'));
    expect(summaryPage).toContain('Recorded setting 1 | Setting status: Fail');
  });

  it('does not mutate saved stage data while building factual summaries', async () => {
    const review = createReportReview({ stageCOutput: JSON.stringify(REPORT_INSTRUCTIONS) });
    const before = JSON.stringify(review);
    await reportText(review);
    expect(JSON.stringify(review)).toBe(before);
  });

  it('keeps a large multi-finding report concise and renders repeated remediation only once', async () => {
    const repeatedRemediation = {
      findingTitle: 'Variable purpose is missing',
      whyItMatters: 'The calling topic cannot confirm the expected value.',
      makerAction: 'Add one specific description for the affected variable.',
      suggestedText: 'Value supplied by the calling topic in the documented format.',
      acceptanceCheck: 'Confirm that the description states purpose, format, and blank-value behavior.',
    };
    const variableItems = Array.from({ length: 18 }, (_, index) => ({
      item: `Synthetic topic ${index + 1}`,
      variable: `inputValue${index + 1}`,
      componentId: `synthetic-component-${index + 1}`,
      schemaName: `synthetic.topic${index + 1}`,
      setting: `inputs.inputValue${index + 1}.description`,
      current: '',
      suggested: repeatedRemediation.suggestedText,
      assessmentStatus: 'fail' as const,
      evidence: {
        source: 'configuration' as const,
        status: 'verified' as const,
        setting: `inputs.inputValue${index + 1}.description`,
        quote: '',
        reason: 'The declared setting is empty.',
      },
      remediation: repeatedRemediation,
    }));
    const extraPatterns = [
      'Unclear Model Description',
      'Overlapping Topic Descriptions',
      'Tool Routing Gap',
      'Missing Output Variable Description',
      'Unclear Output Variable Name',
    ].map((PatternName, index) => ({
      PatternId: `synthetic-pattern-${index + 1}`,
      PatternName,
      Status: false,
      AssessmentStatus: 'fail' as const,
      Description: `Synthetic finding ${index + 1}.`,
      Recommendation: `Correct synthetic finding ${index + 1}.`,
      Topics: [{
        item: `Synthetic route ${index + 1}`,
        componentId: `synthetic-route-${index + 1}`,
        current: `Current route text ${index + 1}.`,
        assessmentStatus: 'fail' as const,
        evidence: {
          source: 'configuration' as const,
          status: 'verified' as const,
          quote: `Current route text ${index + 1}.`,
        },
      }],
    }));
    const instructionIssues = Array.from({ length: 9 }, (_, index) => ({
      ...REPORT_INSTRUCTIONS.issues[0],
      id: `synthetic-instruction-${index + 1}`,
      criteriaId: COMPLIANCE_CRITERIA[index].id,
      title: `Synthetic instruction finding ${index + 1}`,
      remediation: {
        ...REPORT_INSTRUCTIONS.issues[0].remediation!,
        findingTitle: `Synthetic instruction finding ${index + 1}`,
        makerAction: `Correct instruction behavior ${index + 1}.`,
        suggestedText: `Synthetic instruction text ${index + 1}.`,
        acceptanceCheck: `Verify instruction behavior ${index + 1}.`,
      },
    }));
    const review = createReportReview({
      stageBOutput: JSON.stringify({
        Patterns: [{
          ...REPORT_PATTERNS[0],
          Topics: variableItems,
        }, ...extraPatterns],
      }),
      stageCOutput: JSON.stringify({
        ...REPORT_INSTRUCTIONS,
        issues: instructionIssues,
        criterionAssessments: COMPLIANCE_CRITERIA.map((criterion, index) => ({
          criteriaId: criterion.id,
          status: index < instructionIssues.length ? 'fail' : 'pass',
          reason: `Synthetic criterion outcome ${index + 1}.`,
        })),
      }),
    });

    const pages = pdfPageText(await reportText(review));
    const text = pages.join(' ');

    expect(pages.length).toBeLessThanOrEqual(20);
    expect(text.match(/Add one specific description for the affected variable\./g))
      .toHaveLength(1);
    for (let index = 1; index <= variableItems.length; index++) {
      expect(text).toContain(`Synthetic topic ${index}`);
      expect(text).toContain(`inputValue${index}`);
    }
  });
});
