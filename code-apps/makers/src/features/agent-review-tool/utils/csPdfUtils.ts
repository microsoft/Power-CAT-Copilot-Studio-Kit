import { jsPDF } from 'jspdf';
import type { ReviewResult } from '../contracts/ReviewResult';
import { ASSESSMENT_LABELS } from './reviewAssessment';
import { CsPdfLayout, type CsPdfParagraph } from './csPdfLayout';
import { csPdfReportTitle, renderCsPdfCover } from './csPdfTemplate';
import { PDF_FONT_NOTICE } from './csPdfText';
import { STANDARD_REVIEW_LIMITS } from './standardReviewProjection';
import { pillarNameLabelFor } from '../review-core/harness';
import {
  pillarContributions, type PillarContribution,
} from '../agents-experience/services/scoring';
import {
  buildCsReportModel, CS_REPORT_REFERENCES,
  type CsPdfReportOptions, type CsReportField, type CsReportModel, type CsReportRow,
} from './csReportModel';

export type { CsPdfReportOptions } from './csReportModel';

type SeverityCaption = 'Pattern inherent severity' | 'Stored issue severity';
type FindingKind = 'pattern' | 'instruction';

interface NumberedFinding {
  id: string;
  kind: FindingKind;
  row: CsReportRow;
}

const CONTENT_SECTIONS = [
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
] as const;

const SEVERITY_POINTS: Record<CsReportRow['severity'], number> = {
  High: 3,
  Medium: 2,
  Low: 1,
  Unspecified: 0,
};

function score(value: number | null): string {
  return value === null ? 'Not assessed (no available saved score)' : `${value} / 100`;
}

function severityColor(row: CsReportRow): string {
  if (row.status !== 'fail') return '#555555';
  return row.severity === 'High' ? '#a4262c' : row.severity === 'Medium' ? '#875600' : '#17436b';
}

function fieldParagraphs(values: CsReportField[]): CsPdfParagraph[] {
  const paragraphs: CsPdfParagraph[] = values.filter(field => !field.omission)
    .map(field => ({ value: `${field.label}: ${field.value}`, options: { gap: 1.25 } }));
  for (const [omission, caption] of [['missing', 'Not recorded'], ['public-safe', 'Omitted for public-safe export']] as const) {
    const labels = values.filter(field => field.omission === omission).map(field => field.label);
    if (labels.length) paragraphs.push({ value: `${caption}: ${labels.join(', ')}.`, options: { gap: 1.25, style: 'italic' } });
  }
  return paragraphs;
}

function fields(layout: CsPdfLayout, values: CsReportField[]): void {
  for (const { value, options = {} } of fieldParagraphs(values)) {
    layout.block([{
      value,
      options: value.length > 500 ? { ...options, fontSize: 7 } : options,
    }]);
  }
}

function compactFieldParagraphs(
  values: CsReportField[],
  seenValues: Set<string>,
): CsPdfParagraph[] {
  const entries: string[] = [];
  for (const field of values.filter(value => !value.omission)) {
    if (seenValues.has(field.value)) continue;
    seenValues.add(field.value);
    entries.push(`${field.label}: ${field.value}`);
  }
  for (const [omission, caption] of [['missing', 'Not recorded'], ['public-safe', 'Omitted for public-safe export']] as const) {
    const labels = values.filter(field => field.omission === omission).map(field => field.label);
    if (labels.length) entries.push(`${caption}: ${labels.join(', ')}.`);
  }
  const paragraphs: CsPdfParagraph[] = [];
  let current = '';
  for (const entry of entries) {
    if (current && current.length + entry.length + 3 > 280) {
      paragraphs.push({
        value: current,
        options: { fontSize: current.length > 500 ? 7 : 8.5, gap: 0.75 },
      });
      current = '';
    }
    current = current ? `${current} | ${entry}` : entry;
  }
  if (current) {
    paragraphs.push({
      value: current,
      options: { fontSize: current.length > 500 ? 7 : 8.5, gap: 0.75 },
    });
  }
  return paragraphs;
}

function contextFields(report: CsReportModel): CsReportField[] {
  const fields = report.metadata.filter(field =>
    !['Review date', 'Export date', 'Source', 'Agent version (saved)'].includes(field.label));
  const policies = fields.filter(field => field.label.endsWith(' policy') && !field.omission);
  const grouped = fields.filter(field => !policies.includes(field));
  for (const value of new Set(policies.map(field => field.value))) {
    grouped.push({ label: policies.filter(field => field.value === value).map(field => field.label).join(' / '), value });
  }
  return grouped;
}

function statusSummary(label: string, rows: CsReportRow[]): string {
  const count = (status: CsReportRow['status']) => rows.filter(row => row.status === status).length;
  return `${label}: ${rows.length} included; Pass: ${count('pass')}; Fail: ${count('fail')}; N/A: ${count('not-applicable')}; Not assessed: ${count('not-assessed')}.`;
}

function rowFields(row: CsReportRow): CsReportField[] {
  return [...row.fields, ...row.items.flatMap(item => item.fields)];
}

function recordedValues(row: CsReportRow, labels: string[]): string[] {
  return [...new Set(rowFields(row)
    .filter(field => labels.includes(field.label)
      && !field.omission
      && field.value !== 'Not recorded')
    .map(field => field.value))];
}

function recordedValue(row: CsReportRow, labels: string[]): string | undefined {
  const values = recordedValues(row, labels);
  return values.length ? values.join(' | ') : undefined;
}

function preferredRecordedValue(row: CsReportRow, labels: string[]): string | undefined {
  return labels.map(label => recordedValue(row, [label])).find(Boolean);
}

function findingTitle(finding: NumberedFinding): string {
  return finding.kind === 'pattern'
    ? finding.row.title
    : recordedValue(finding.row, ['Finding title']) ?? finding.row.title;
}

function conciseRecordedValue(
  row: CsReportRow,
  labels: string[],
): { displayValue?: string; renderedValues: string[]; hasValues: boolean } {
  const values = recordedValues(row, labels);
  const displayValue = values.length ? values.join(' | ') : undefined;
  if (!displayValue) return { renderedValues: [], hasValues: false };
  return { displayValue, renderedValues: values, hasValues: true };
}

function concisePreferredRecordedValue(
  row: CsReportRow,
  labels: string[],
): { displayValue?: string; renderedValues: string[]; hasValues: boolean } {
  for (const label of labels) {
    const value = conciseRecordedValue(row, [label]);
    if (value.hasValues) return value;
  }
  return { renderedValues: [], hasValues: false };
}

function conciseImpact(row: CsReportRow): ReturnType<typeof conciseRecordedValue> {
  const contextualImpact = conciseRecordedValue(row, ['Why it matters']);
  if (contextualImpact.hasValues) return contextualImpact;
  return conciseRecordedValue(row, ['Finding']);
}

function currentTextFallback(row: CsReportRow, kind: FindingKind): string {
  const currentLabels = new Set(['Reviewed value', 'Evidence quote']);
  if (rowFields(row).some(field =>
    currentLabels.has(field.label) && field.omission === 'public-safe')) {
    return 'Omitted from the public-safe report.';
  }
  if (kind === 'pattern'
    && (row.title === 'Missing Input Variable Description'
      || row.title === 'Missing Output Variable Description')) {
    return 'Blank in the reviewed configuration.';
  }
  if (kind === 'instruction'
    && recordedValues(row, ['Evidence reason'])
      .some(value => /complete instruction field|missing guidance/i.test(value))) {
    return 'No matching guidance was found in the reviewed instructions; '
      + 'this finding records an omission, so no exact quote is available.';
  }
  return 'Not recorded in the saved review.';
}

function numberedFindings(report: CsReportModel): NumberedFinding[] {
  const patterns = report.patterns.filter(row => row.status === 'fail')
    .map((row, index) => ({ id: `P-${String(index + 1).padStart(2, '0')}`, kind: 'pattern' as const, row }));
  const instructions = report.instructionIssues.filter(row => row.status === 'fail')
    .map((row, index) => ({ id: `I-${String(index + 1).padStart(2, '0')}`, kind: 'instruction' as const, row }));
  return [...patterns, ...instructions];
}

function renderActionableFinding(
  layout: CsPdfLayout,
  report: CsReportModel,
  finding: NumberedFinding,
): Set<string> {
  const { kind, row } = finding;
  const criterion = recordedValue(row, ['Criterion']);
  const affected = kind === 'pattern'
    ? conciseRecordedValue(row, ['Topic / resource'])
    : {
        displayValue: report.publicSafe ? 'Agent instructions' : `${report.agentName} instructions`,
        renderedValues: [],
        hasValues: true,
      };
  const changeLocation = kind === 'pattern'
    ? conciseRecordedValue(row, ['Setting', 'Evidence setting'])
    : {
        displayValue: 'Copilot Studio > Agent settings > Instructions',
        renderedValues: [],
        hasValues: true,
      };
  const current = concisePreferredRecordedValue(row, ['Reviewed value', 'Evidence quote']);
  const impact = conciseImpact(row);
  const action = concisePreferredRecordedValue(row, ['Maker action', 'Recommendation']);
  const suggestion = concisePreferredRecordedValue(
    row,
    ['Suggested text (draft for maker review)', 'Suggested value'],
  );
  const acceptance = conciseRecordedValue(row, ['Acceptance check']);
  const affectedComponent = affected.displayValue;
  const whereToChange = changeLocation.displayValue;
  const currentText = current.displayValue ?? currentTextFallback(row, kind);
  const whyItMatters = impact.displayValue;
  const makerAction = action.displayValue;
  const suggestedText = suggestion.displayValue;
  const acceptanceCheck = acceptance.displayValue;
  layout.field('Status', ASSESSMENT_LABELS[row.status], {
    style: 'bold',
    color: severityColor(row),
  });
  layout.field(kind === 'pattern' ? 'Pattern inherent severity' : 'Stored issue severity', row.severity, {
    style: 'bold',
    color: severityColor(row),
  });
  layout.field(kind === 'pattern' ? 'Pattern' : 'Criterion',
    kind === 'pattern' ? row.title : criterion ?? row.title);

  const details = [
    ['Affected component', affectedComponent],
    ['Where to change', whereToChange],
    ['Current text', currentText],
    ['Why it matters', whyItMatters],
    ['Maker action', makerAction],
    ['Suggested text', suggestedText],
    ['Acceptance check', acceptanceCheck
      ?? 'Re-run the Standard review and confirm that this finding is no longer present.'],
  ] as const;
  for (const [label, value] of details) {
    if (!value) continue;
    if (label === 'Suggested text') {
      layout.callout(label, `${value} (Draft for maker review.)`);
    } else {
      layout.field(label, value);
    }
  }
  return new Set([
    affectedComponent,
    whereToChange,
    currentText,
    whyItMatters,
    makerAction,
    suggestedText,
    acceptanceCheck,
    ...affected.renderedValues,
    ...changeLocation.renderedValues,
    ...current.renderedValues,
    ...impact.renderedValues,
    ...action.renderedValues,
    ...suggestion.renderedValues,
    ...acceptance.renderedValues,
  ].filter((value): value is string => !!value));
}

function renderRow(
  layout: CsPdfLayout,
  report: CsReportModel,
  row: CsReportRow,
  severityCaption: SeverityCaption,
  numbered?: NumberedFinding,
): void {
  const rowIdentity = `${severityCaption === 'Pattern inherent severity' ? 'Pattern check' : 'Instruction issue'} ${row.id.split('-').at(-1)}`;
  const continuationIdentity = numbered
    ? `${numbered.id} - ${findingTitle(numbered)}`
    : rowIdentity;
  layout.setContinuationContext(continuationIdentity);
  const title = numbered ? `${numbered.id} - ${findingTitle(numbered)}`
    : row.title.startsWith(rowIdentity) ? row.title : `${rowIdentity}: ${row.title}`;
  if (numbered) layout.findingHeading(title);
  else layout.heading(title, 3);
  let renderedValues = new Set<string>();
  if (numbered) {
    renderedValues = renderActionableFinding(layout, report, numbered);
  }
  const assessmentLimit: CsPdfParagraph[] = row.status === 'not-assessed' ? [{
    value: 'Not assessed is an assessment limit, not a passed check or a confirmed failure.',
    options: { style: 'italic', gap: 1.25 },
  }] : [];
  if (!numbered) {
    layout.block([
      { value: `Status: ${ASSESSMENT_LABELS[row.status]} | ${severityCaption}: ${row.severity}`,
        options: { style: 'bold', color: severityColor(row), gap: 1.25 } },
      ...fieldParagraphs(row.fields),
      ...assessmentLimit,
    ]);
  } else {
    const validation = [
      recordedValue(row, ['Evidence reason']),
      recordedValue(row, ['Assessment reason']),
    ].filter((value): value is string => !!value).join(' | ');
    const validationStatus = recordedValue(row, ['Evidence validation']);
    const validationText = [validationStatus, validation]
      .filter((value): value is string => !!value)
      .join(' | ');
    if (validationText) {
      layout.field('Saved validation', validationText, { fontSize: 8.5 });
    }
    assessmentLimit.forEach(paragraph => layout.paragraph(paragraph.value, paragraph.options));
  }
  const settingsSummary = row.items.length
    ? `Recorded settings: ${row.items.length} | Marked Fail: ${row.items.filter(item => item.status === 'fail').length}`
    : undefined;
  if (settingsSummary && !numbered) {
    layout.paragraph(settingsSummary,
      { style: 'bold', gap: 1.25 });
  }
  row.items.forEach((item, index) => {
    layout.setContinuationContext(
      `${numbered?.id ?? rowIdentity} | Recorded setting ${index + 1}`,
      true,
    );
    if (!numbered) {
      layout.heading(`Recorded setting ${index + 1} | Setting status: ${ASSESSMENT_LABELS[item.status]}`, 3);
      fields(layout, item.fields);
      return;
    }
    const identityLabels = new Set([
      'Topic / resource',
      'Variable',
      'Setting',
    ]);
    const identityFields = item.fields.filter(field => identityLabels.has(field.label));
    const detailLabels = new Set([
      'Reviewed value',
      'Suggested value',
      'Saved setting assessment reason',
      'Evidence quote',
      'Evidence validation',
      'Evidence reason',
      'Finding title',
      'Why it matters',
      'Maker action',
      'Acceptance check',
    ]);
    const hasEvidenceQuote = item.fields.some(field =>
      field.label === 'Evidence quote' && !field.omission);
    const detailFields = item.fields
      .filter(field => detailLabels.has(field.label)
        && (!hasEvidenceQuote || field.label !== 'Reviewed value')
        && (item.status !== 'fail'
          || field.label !== 'Saved setting assessment reason'
          || !/workflow candidate passed|source text is confirmed/i.test(field.value))
        && !renderedValues.has(field.value));
    const identityParagraphs = compactFieldParagraphs(identityFields, new Set());
    const detailParagraphs = compactFieldParagraphs(detailFields, renderedValues);
    const settingParagraphs: CsPdfParagraph[] = [
      {
        value: `Recorded setting ${index + 1} | Setting status: ${ASSESSMENT_LABELS[item.status]}`,
        options: { style: 'bold', color: severityColor(row), fontSize: 8.5, gap: 0.75 },
      },
      ...identityParagraphs,
      ...detailParagraphs,
    ];
    if (index === 0 && settingsSummary) {
      settingParagraphs.unshift({
        value: settingsSummary,
        options: { style: 'bold', gap: 1.25 },
      });
    }
    layout.block(settingParagraphs);
  });
  layout.setContinuationContext();
}

function renderRows(
  layout: CsPdfLayout,
  report: CsReportModel,
  rows: CsReportRow[],
  severityCaption: SeverityCaption,
  kind: FindingKind,
): void {
  const numbered = new Map(numberedFindings(report)
    .filter(finding => finding.kind === kind)
    .map(finding => [finding.row, finding]));
  for (const status of ['fail', 'not-assessed', 'pass', 'not-applicable'] as const) {
    const group = rows.filter(row => row.status === status);
    if (group.length === 0) continue;
    const heading = status === 'fail'
      ? `${kind === 'pattern' ? 'Confirmed pattern and routing issues' : 'Confirmed instruction issues'} - ${group.length}`
      : `${ASSESSMENT_LABELS[status]} - ${group.length} included rows`;
    layout.heading(heading, 2);
    for (const row of group) renderRow(layout, report, row, severityCaption, numbered.get(row));
  }
}

function renderContents(layout: CsPdfLayout): void {
  layout.heading('Contents', 1);
  layout.paragraph(
    'This report follows the approved actionable maker-report sequence. Page flow depends on the amount of saved evidence.',
  );
  CONTENT_SECTIONS.forEach((section, index) => {
    const legacyLabel = section === 'Pattern review'
      ? ' - Pattern assessment'
      : section === 'Instruction review'
        ? ' - Instruction assessment'
        : section === 'Validation record and limits'
          ? ' - Assessment scope and limits'
          : '';
    layout.paragraph(`${index + 1}. ${section}${legacyLabel}`, {
      fontSize: 12,
      style: 'bold',
      color: '#17436b',
      gap: 3,
    });
  });
  layout.paragraph(`Report boundary: ${STANDARD_REVIEW_LIMITS}`);
}

/**
 * The share each pillar actually carried, read from the scorer's own arithmetic.
 *
 * Restating the weight table here instead is exactly what let this export keep printing a 50/50
 * blend for a release after the composite replaced it. The pillar names take the standard
 * harness's spelling for the same reason: this report covers standard reviews only, and a reader
 * comparing it against the page must not find the same pillar under two names.
 */
function compositeShares(contributions: readonly PillarContribution[]): string {
  const measured = contributions
    .filter(c => c.applicable && c.score !== null && c.effectiveWeight > 0)
    .map(c =>
      `${pillarNameLabelFor('standard', c.pillar)} ${c.score}% at `
      + `${Math.round(c.effectiveWeight)}% weight`);
  return measured.length ? ` (${measured.join('; ')})` : '';
}

function renderScoreCalculations(layout: CsPdfLayout, report: CsReportModel): void {  const patternPass = report.patterns.filter(row => row.status === 'pass').length;
  const patternFail = report.patterns.filter(row => row.status === 'fail').length;
  const patternCompleted = patternPass + patternFail;
  const calculatedPattern = patternCompleted
    ? Math.round(patternPass / patternCompleted * 100)
    : null;

  const instructionApplicable = report.instructionCriteria
    .filter(row => row.status === 'pass' || row.status === 'fail');
  const passedWeight = instructionApplicable
    .filter(row => row.status === 'pass')
    .reduce((sum, row) => sum + SEVERITY_POINTS[row.severity], 0);
  const availableWeight = instructionApplicable
    .reduce((sum, row) => sum + SEVERITY_POINTS[row.severity], 0);
  const calculatedInstruction = availableWeight
    ? Math.round(passedWeight / availableWeight * 100)
    : null;
  // Which rubric produced the headline, decided exactly as the review page decides it, so the
  // export and the screen can never disagree about what the number means.
  const contributions = report.scores.legacy ? [] : pillarContributions(report.scores.pillars);
  const isComposite = contributions.some(c => c.applicable && c.score !== null);
  // Only a pre-composite row actually holds a 50/50 blend in its saved overall score. Recomputing
  // that blend for a composite row restated a rubric this review was never graded against, printed
  // a formula that did not reconcile, and then tripped the discrepancy notice below on every
  // composite export — reporting the export's own stale arithmetic as a problem with the review.
  const calculatedOverall = isComposite
    ? report.scores.overall
    : report.scores.pattern !== null && report.scores.instruction !== null
      ? Math.round(report.scores.pattern * 0.5 + report.scores.instruction * 0.5)
      : null;

  layout.heading('Score calculations', 2);
  layout.paragraph(
    patternCompleted
      ? `Pattern calculation: ${patternPass} Pass / ${patternCompleted} completed applicable checks x 100 = ${calculatedPattern}%. Saved pattern score: ${score(report.scores.pattern)}.`
      : `Pattern calculation: no completed applicable checks. Saved pattern score: ${score(report.scores.pattern)}.`,
  );
  layout.paragraph(
    availableWeight
      ? `Instruction calculation: ${passedWeight} passed weight points / ${availableWeight} completed applicable weight points x 100 = ${calculatedInstruction}%. Saved instruction score: ${score(report.scores.instruction)}.`
      : `Instruction calculation: no completed applicable criteria. Saved instruction score: ${score(report.scores.instruction)}.`,
  );
  layout.paragraph(
    isComposite
      ? `Overall calculation: the weighted mean of the review pillars, each taking the share it carried in this review${compositeShares(contributions)}. Saved overall score: ${score(report.scores.overall)}.`
      : calculatedOverall === null
        ? `Overall calculation: unavailable because one or both saved component scores are not assessed. Saved overall score: ${score(report.scores.overall)}.`
        : `Overall calculation: round((${report.scores.pattern} x 0.5) + (${report.scores.instruction} x 0.5)) = ${calculatedOverall}%. Saved overall score: ${score(report.scores.overall)}.`,
  );
  if (calculatedPattern !== report.scores.pattern
    || calculatedInstruction !== report.scores.instruction
    || calculatedOverall !== report.scores.overall) {
    layout.paragraph(
      'One or more displayed row calculations differ from the immutable saved scores. The saved scores remain authoritative; this export does not regrade the review.',
      { style: 'italic' },
    );
  }
}

function renderHighImpactFindings(layout: CsPdfLayout, report: CsReportModel): void {
  const high = numberedFindings(report).filter(finding => finding.row.severity === 'High');
  layout.heading('High-impact findings', 2);
  if (high.length === 0) {
    layout.paragraph('No High-severity failed finding was recorded in this saved review.');
    return;
  }
  high.forEach(finding => {
    layout.paragraph(
      `${finding.id} - ${findingTitle(finding)}`,
      { style: 'bold', color: severityColor(finding.row), gap: 1.25 },
    );
  });
}

function renderSummary(layout: CsPdfLayout, report: CsReportModel): void {
  layout.setContinuationContext('Executive summary');
  layout.heading('Executive summary', 1);
  layout.paragraph(
    `This report presents the saved Standard authoring assessment for ${report.agentName}. `
    + 'It keeps evidence, outcomes, and maker actions together without regrading the review.',
  );
  layout.heading('Saved review scores', 2);
  layout.table(['Score', 'Result'], [
    ['Overall score:', score(report.scores.overall)],
    ['Pattern score:', score(report.scores.pattern)],
    ['Instruction score:', score(report.scores.instruction)],
  ], { columnRatios: [2, 1] });
  layout.paragraph('All scores use the saved 0-100 scale. No regrading is performed.');
  renderScoreCalculations(layout, report);
  layout.paragraph(STANDARD_REVIEW_LIMITS);
  layout.heading('Finding summary', 2);
  layout.table(['Severity', 'Count'], [
    ['High', String(report.counts.severity.High)],
    ['Medium', String(report.counts.severity.Medium)],
    ['Low', String(report.counts.severity.Low)],
    ['Unspecified', String(report.counts.severity.Unspecified)],
    ['Total', String(report.counts.total)],
  ], { columnRatios: [2, 1] });
  layout.paragraph(`Failed check categories: ${report.counts.failedCheckCategories} | Instruction issues counted: ${report.counts.instructionIssues} | Total counted findings: ${report.counts.total}`);
  layout.paragraph(`Severity totals - High: ${report.counts.severity.High} | Medium: ${report.counts.severity.Medium} | Low: ${report.counts.severity.Low} | Unspecified: ${report.counts.severity.Unspecified}`);
  layout.paragraph('Severity totals use pattern inherent severity and stored instruction-issue severity; criteria are not counted again.');
  layout.paragraph(statusSummary('Pattern check rows', report.patterns));
  layout.paragraph(statusSummary('Instruction issue rows', report.instructionIssues));
  layout.paragraph('Counts describe included detail rows only, not affected topics or variables. N/A and Not assessed are excluded from failure totals.');
  for (const [key, label] of [['patterns', 'Pattern'], ['instructions', 'Instruction']] as const) {
    if (report.availability[key] === 'partial') {
      layout.paragraph(`${label} results are partial. Some saved rows or outcomes are incomplete or not assessed; readable findings are retained.`, { gap: 1.25 });
    }
  }
  if (report.availability.patterns === 'unavailable') {
    layout.paragraph('Pattern data is unavailable. No complete pattern conclusion can be drawn from these saved details.');
  }
  if (report.availability.instructions === 'unavailable') {
    layout.paragraph('Instruction data is unavailable. Missing data is not a successful compliance result.');
  }
  renderHighImpactFindings(layout, report);
  layout.setContinuationContext('Review scope');
  layout.heading('Review scope', 1);
  layout.paragraph(report.scopeSummary, { style: 'bold' });
  layout.paragraph(`Selected saved standard review${report.publicSafe ? ' | Public-safe export' : ''}`);
  layout.table(['Item', 'Result'], [
    ['Agent:', report.agentName],
    ['Scope:', report.scopeSummary],
    ...report.metadata
      .filter(field => ['Review date', 'Export date', 'Source', 'Agent version (saved)'].includes(field.label))
      .map(field => [`${field.label}:`, field.value]),
    ['Pattern availability:', report.availability.patterns],
    ['Instruction availability:', report.availability.instructions],
  ], { columnRatios: [1, 2] });
  layout.paragraph(`Assessment availability: patterns ${report.availability.patterns}; instructions ${report.availability.instructions}.`);
  layout.setContinuationContext();
}

function renderImplementationOrder(layout: CsPdfLayout, report: CsReportModel): void {
  layout.setContinuationContext('Recommended implementation order');
  layout.heading('Recommended implementation order', 1);
  layout.paragraph(
    'Resolve High-severity findings first, then Medium and Low. Re-run the review and complete each recorded acceptance check before publishing.',
  );
  const rank: Record<CsReportRow['severity'], number> = {
    High: 0,
    Medium: 1,
    Low: 2,
    Unspecified: 3,
  };
  const findings = numberedFindings(report)
    .sort((left, right) => rank[left.row.severity] - rank[right.row.severity]);
  if (findings.length === 0) {
    layout.paragraph('No failed finding rows were recorded in this saved review.');
    layout.setContinuationContext();
    return;
  }
  findings.forEach((finding, index) => {
    layout.paragraph(
      `${index + 1}. ${finding.id} - ${findingTitle(finding)} | ${finding.row.severity} severity`,
      { style: 'bold', color: severityColor(finding.row), fontSize: 8.5, gap: 1.25 },
    );
  });
  layout.setContinuationContext();
}

function renderTestsToRun(layout: CsPdfLayout, report: CsReportModel): void {
  layout.setContinuationContext('Tests to run after changes');
  layout.heading('Tests to run after changes', 1);
  layout.paragraph(
    'After the maker completes the changes, run every finding acceptance check before publication.',
  );
  const rows = numberedFindings(report).map(finding => [
    finding.id,
    recordedValue(finding.row, ['Acceptance check'])
      ?? 'Re-run the Standard review and confirm that this finding is no longer present.',
  ]);
  if (rows.length) {
    layout.table(['Finding', 'Acceptance check'], rows, {
      columnRatios: [1, 5],
      fontSize: 8.5,
    });
  } else {
    layout.paragraph('No failed finding rows were recorded in this saved review.');
  }
  layout.setContinuationContext();
}

function renderCheckTable(
  layout: CsPdfLayout,
  heading: string,
  rows: CsReportRow[],
  prefix: 'P' | 'I',
): void {
  layout.setContinuationContext(heading);
  layout.heading(heading, 1);
  const values = rows.map((row, index) => {
    const reason = row.status === 'not-assessed' || row.status === 'not-applicable'
      ? preferredRecordedValue(row, ['Assessment reason', 'Display applicability'])
      : undefined;
    return [
      `${prefix}-${String(index + 1).padStart(2, '0')} | ${ASSESSMENT_LABELS[row.status]} | ${prefix === 'P' ? 'Pattern inherent severity' : 'Criterion inherent severity'}: ${row.severity} | ${row.title}${reason ? ` | ${reason}` : ''}`,
    ];
  });
  layout.table(['Saved outcome'], values, {
    fontSize: 7.5,
    rowTextColors: rows.map(row => row.status === 'fail' ? severityColor(row) : undefined),
  });
  const retainedDetails = rows.filter(row => row.status !== 'fail' && row.items.length);
  if (retainedDetails.length) {
    layout.heading('Saved non-failing and unassessed detail', 2);
    retainedDetails.forEach(row => {
      layout.paragraph(
        `Status: ${ASSESSMENT_LABELS[row.status]} | ${prefix === 'P' ? 'Pattern inherent severity' : 'Criterion inherent severity'}: ${row.severity}`,
        { style: 'bold', fontSize: 8, gap: 1 },
      );
      row.items.forEach(item => fields(layout, item.fields));
    });
  }
  layout.setContinuationContext();
}

function renderValidationRecord(layout: CsPdfLayout, report: CsReportModel): void {
  layout.setContinuationContext('Validation record and limits');
  layout.heading('Validation record and limits', 1);
  layout.paragraph('Report source: one immutable saved Standard review. The export made no AI call and did not recalculate a saved score.');
  layout.paragraph(
    `Assessment availability: patterns ${report.availability.patterns}; instructions ${report.availability.instructions}.`,
  );
  const provenance = report.metadata.filter(field =>
    field.label.startsWith('Workflow ')
    || field.label === 'Rejected workflow candidates');
  if (provenance.length) {
    layout.heading('Workflow validation record', 2);
    layout.table(['Validation item', 'Saved value'], provenance.map(field =>
      [`${field.label}:`, field.value]), { columnRatios: [1, 2], fontSize: 8 });
  } else {
    layout.paragraph('Workflow validation record: Not recorded for this saved review.');
  }
  layout.heading('Assessment scope and limits', 2);
  report.limits.forEach(limit => layout.paragraph(`• ${limit}`, { fontSize: 8.5, gap: 1 }));
  layout.heading('Saved review context', 2);
  layout.table(['Context item', 'Saved value'], contextFields(report).map(field =>
    [`${field.label}:`, field.value]), { columnRatios: [1, 2], fontSize: 8 });
  layout.paragraph(PDF_FONT_NOTICE, { fontSize: 8, gap: 0.75 });
  layout.setContinuationContext();
}

function renderReport(report: CsReportModel): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setCreationDate(report.exportedOn);
  doc.setProperties({
    title: 'Copilot Studio Agent Review', subject: 'Selected saved standard review; no regrading',
    author: 'Copilot Studio Kit', creator: 'Copilot Studio Kit local PDF exporter',
  });
  renderCsPdfCover(doc, report.agentName, report.publicSafe);
  doc.addPage();
  const layout = new CsPdfLayout(doc);
  renderContents(layout);
  layout.newPage();

  renderSummary(layout, report);

  layout.newPage();
  layout.heading('Pattern review', 1);
  layout.heading('Pattern assessment', 2);
  layout.paragraph(`Pattern score: ${score(report.scores.pattern)}`, { style: 'bold' });
  layout.paragraph(statusSummary('Pattern check categories', report.patterns));
  if (report.patterns.length === 0) {
    layout.paragraph(report.availability.patterns === 'unavailable'
      ? 'Pattern assessment data unavailable. See the assessment limits.'
      : 'Pattern assessment is partial: no readable pattern check rows were saved. This is not evidence that every check passed.');
  } else {
    const failedPatterns = report.patterns.filter(row => row.status === 'fail');
    if (failedPatterns.length) {
      renderRows(layout, report, failedPatterns, 'Pattern inherent severity', 'pattern');
    } else {
      layout.paragraph('No failed pattern check was recorded in this saved review.');
    }
    const summarizedPatterns = report.patterns.length - failedPatterns.length;
    if (summarizedPatterns > 0) {
      layout.paragraph(
        `${summarizedPatterns} non-failing or unassessed pattern check(s) are listed with their saved outcomes in All pattern checks.`,
        { style: 'italic' },
      );
    }
  }

  layout.newPage();
  layout.heading('Instruction review', 1);
  layout.heading('Instruction assessment', 2);
  layout.paragraph(`Instruction score: ${score(report.scores.instruction)}`, { style: 'bold' });
  layout.paragraph(statusSummary('Instruction issue rows', report.instructionIssues));
  layout.heading('Instruction criterion outcomes', 2);
  layout.paragraph(statusSummary('Criteria (not the issue counting unit)', report.instructionCriteria));
  layout.paragraph('Complete criterion outcomes and available saved reasons are listed in All instruction criteria.');
  if (report.instructionIssues.length === 0) {
    layout.paragraph(report.availability.instructions === 'unavailable'
      ? 'Instruction assessment data unavailable. See the assessment limits.'
      : 'No readable instruction issue rows were saved. Criterion outcomes and assessment limits are shown below; this is not proof of complete coverage.');
  } else renderRows(layout, report, report.instructionIssues, 'Stored issue severity', 'instruction');
  renderImplementationOrder(layout, report);
  renderTestsToRun(layout, report);

  renderCheckTable(layout, 'All pattern checks', report.patterns, 'P');
  renderCheckTable(layout, 'All instruction criteria', report.instructionCriteria, 'I');

  layout.newPage();
  renderValidationRecord(layout, report);
  layout.setContinuationContext('Official references');
  layout.heading('Official references', 1);
  layout.paragraph('Official authoring guidance; these links are not proof of measured runtime failures.', {
    fontSize: 7,
    gap: 0.5,
  });
  for (const reference of CS_REPORT_REFERENCES) {
    layout.block([
      {
        value: `${reference.title}\n${reference.url}`,
        options: { style: 'bold', color: '#17436b', url: reference.url, fontSize: 7, gap: 0.25 },
      },
    ]);
  }
  layout.setContinuationContext();
  layout.finish(report.publicSafe, true, csPdfReportTitle(report.agentName));
  return doc;
}

/**
 * Generate a local PDF from the selected saved CS review. No source or AI calls are made.
 * Public-safe export omits source/evidence values without changing saved scores or finding rows.
 */
export async function generateCsPdfReport(review: ReviewResult, options: CsPdfReportOptions = {}): Promise<Blob> {
  return renderReport(buildCsReportModel(review, options)).output('blob');
}
