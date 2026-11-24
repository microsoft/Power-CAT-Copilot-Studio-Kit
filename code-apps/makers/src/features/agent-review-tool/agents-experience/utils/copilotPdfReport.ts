import { jsPDF } from 'jspdf';
import { CsPdfLayout } from '../../utils/csPdfLayout';
import { csPdfReportTitle, renderCsPdfCover } from '../../utils/csPdfTemplate';
import { PDF_FONT_NOTICE } from '../../utils/csPdfText';
import type { ReviewResult } from '../../contracts/ReviewResult';
import type { ReviewViewModel } from '../components/viewTypes';
import type { CostEfficiencyReview } from '../contracts/CostEfficiency';
import type {
  CopilotSkillExportRow,
  CopilotSkillGradeExportRow,
  ObservedEvidenceExportRow,
} from './copilotReviewExport';
import {
  COPILOT_PDF_SEVERITY,
  copilotPdfField,
  copilotPdfText,
  numberedCopilotFindings,
  renderCopilotChecks,
  renderCopilotFindings,
  renderCopilotReferences,
} from './copilotPdfContent';
import {
  renderCopilotCost,
  renderCopilotEvidence,
  renderCopilotInstructionCoverage,
  renderCopilotOrchestration,
  renderCopilotSkills,
} from './copilotPdfDetails';

export interface CopilotPdfReportData {
  vm: ReviewViewModel;
  reviewMode: 'standard' | 'deep';
  scoreBasis: string;
  instructionCoverage: string;
  crossSkillOrchestration?: string;
  completion: Pick<ReviewResult, 'status' | 'errorMessage'>;
  resources: CopilotSkillExportRow[];
  skillGrades: CopilotSkillGradeExportRow[];
  evidenceRows: ObservedEvidenceExportRow[];
  evidenceWindow: Array<[string, string]>;
  evidenceNote: string;
  persistenceLimits: string[];
  costReview?: CostEfficiencyReview;
}

const CONTENTS = [
  'Executive summary',
  'Review scope',
  'Configuration review',
  'Instruction review',
  'Skills and resources',
  'Recommended implementation order',
  'Tests to run after changes',
  'All recorded checks',
  'Evaluation coverage',
  'Observed capability use',
  'Validation record and limits',
  'Official references',
];

function renderSummary(layout: CsPdfLayout, data: CopilotPdfReportData): void {
  const { summary } = data.vm;
  layout.setContinuationContext('Executive summary');
  layout.heading('Executive summary', 1);
  layout.paragraph(
    `This report presents the saved Microsoft Copilot harness assessment for ${copilotPdfText(summary.agentName)}. `
    + 'It keeps evidence and maker actions together without changing the saved review.',
  );
  layout.heading('Saved review scores', 2);
  layout.table(['Score', 'Result'], [
    ['Grounded configuration score:', summary.score === null ? 'Not assessed' : `${summary.score} / 100`],
  ], { columnRatios: [2, 1] });
  copilotPdfField(layout, 'Score basis', data.scoreBasis);
  layout.paragraph('The saved score is authoritative. This export does not regrade the review or use Standard harness weights.');
  if (summary.pillars?.length) {
    layout.heading('Saved pillar breakdown', 2);
    for (const pillar of summary.pillars) {
      copilotPdfField(layout, pillar.pillar,
        `${pillar.score === null ? 'Not assessed' : `${pillar.score} / 100`} | `
        + (pillar.applicable ? `weight ${pillar.weight}` : 'Not applicable'));
    }
  }
  layout.heading('Finding summary', 2);
  layout.table(['Severity', 'Included findings'], [
    ['Error', String(data.vm.findings.filter(finding => finding.sev === 'error').length)],
    ['Warning', String(data.vm.findings.filter(finding => finding.sev === 'warning').length)],
    ['Information', String(data.vm.findings.filter(finding => finding.sev === 'info').length)],
    ['Total', String(data.vm.findings.length)],
  ], { columnRatios: [2, 1] });
  layout.paragraph(
    'These are finding counts, not check counts. Product disposition remains separate from stored technical severity.',
  );
  copilotPdfField(layout, 'Recorded checks', summary.rulesEvaluated);
  copilotPdfField(layout, 'Passed checks', summary.passed);
  copilotPdfField(layout, 'Instruction AI coverage', data.instructionCoverage);
  if (data.crossSkillOrchestration !== undefined) {
    copilotPdfField(layout, 'Cross-skill assessment', data.crossSkillOrchestration);
  }
  copilotPdfField(layout, 'Assessment completeness', data.completion.status === 'failed'
    ? 'Incomplete' : 'Completed according to recorded assessment states');
  if (data.completion.errorMessage) {
    layout.callout('Assessment limit', copilotPdfText(data.completion.errorMessage));
  }
  const high = numberedCopilotFindings(data.vm).filter(item => item.finding.sev === 'error');
  layout.heading('High-impact findings', 2);
  if (!high.length) layout.paragraph('No Error-severity finding was recorded in this saved review.');
  high.forEach(({ label, finding }) => {
    layout.paragraph(`${label} - ${copilotPdfText(finding.title)}`, {
      style: 'bold',
      color: COPILOT_PDF_SEVERITY.error.color,
      gap: 1.25,
    });
  });
  layout.setContinuationContext();
}

function renderScope(layout: CsPdfLayout, data: CopilotPdfReportData, exportedOn: Date): void {
  layout.heading('Review scope', 1);
  layout.paragraph('Selected saved Microsoft Copilot harness review; no new source, transcript, or AI request is made by this export.');
  for (const [label, value] of [
    ['Agent', data.vm.summary.agentName],
    ['Export date', `${exportedOn.toISOString().slice(0, 19).replace('T', ' ')} UTC`],
    ['Reviewed by', data.vm.summary.reviewedBy],
    ['Review duration', data.vm.summary.duration],
    ['Model', data.vm.summary.model],
    ['Skill review mode', data.reviewMode],
    ['Memory', data.vm.summary.memoryEnabled ? 'Enabled' : 'Disabled'],
    ['Web search', data.vm.summary.webSearchEnabled === undefined
      ? 'Not captured' : data.vm.summary.webSearchEnabled ? 'Enabled' : 'Disabled'],
  ] as const) copilotPdfField(layout, label, value);
  if (data.reviewMode === 'standard') {
    layout.paragraph('Analysis coverage: limited - per-resource analysis was not available for this review.');
  }
}

function renderImplementationOrder(layout: CsPdfLayout, data: CopilotPdfReportData): void {
  layout.heading('Recommended implementation order', 1);
  layout.paragraph('Review Error findings first, then Warning and Information findings. Respect each recorded product disposition.');
  const findings = numberedCopilotFindings(data.vm)
    .sort((left, right) => COPILOT_PDF_SEVERITY[left.finding.sev].rank
      - COPILOT_PDF_SEVERITY[right.finding.sev].rank);
  if (!findings.length) layout.paragraph('No finding was recorded. Check assessment limits before drawing a complete conclusion.');
  for (const [index, { label, finding }] of findings.entries()) {
    layout.paragraph(`${index + 1}. ${label} - ${copilotPdfText(finding.title)} | `
      + COPILOT_PDF_SEVERITY[finding.sev].label, { fontSize: 8.5, style: 'bold', gap: 1.25 });
  }
  layout.heading('Tests to run after changes', 1);
  layout.paragraph(
    'General verification guidance, not saved acceptance-test results: repeat the Microsoft Copilot review after each change '
    + 'and confirm the related finding is resolved. Validate intended agent behavior before publication.',
  );
  for (const { label, finding } of findings) {
    copilotPdfField(layout, label, finding.remediation?.acceptanceCheck
      || `Recheck recorded finding ${finding.id} after its recorded maker action.`);
  }
}

function renderLimits(layout: CsPdfLayout, data: CopilotPdfReportData): void {
  layout.heading('Validation record and limits', 1);
  const limits = [
    'Report source: one saved Microsoft Copilot harness assessment. The export made no AI call and did not recalculate a saved score.',
    'Finding identities, product dispositions, recorded outcomes, and available skill grades are retained.',
    'Unavailable or incomplete assessment data does not establish a passed check or a zero skill grade.',
    'Configuration checks and configured test coverage are not proof of runtime behavior.',
    'An execution failure is not an additional agent finding. Review completeness is projected from the recorded assessment states.',
    'Legacy instruction coverage is unknown when no stage status was saved. No completed AI stage is inferred.',
    'Legacy cross-skill applicability and completion are unknown when no cross-skill stage status was saved.',
    'Raw instructions, SKILL.md text, supporting-file contents, source hashes, and prompt payloads are not exported.',
    'Secret-like values and signed URLs are redacted again when each report value is rendered.',
    ...data.persistenceLimits.map(limit => `Saved persistence limit: ${copilotPdfText(limit)}`),
  ];
  if (!data.vm.checks.recorded) limits.push('Rule outcomes were not recorded for this legacy review.');
  if (data.completion.errorMessage) limits.push(copilotPdfText(data.completion.errorMessage));
  limits.forEach(limit => layout.paragraph(limit, { fontSize: 8.5, gap: 1.25 }));
  layout.paragraph(PDF_FONT_NOTICE, { fontSize: 8, gap: 0.75 });
}

/** Render export-safe Copilot data with the accepted Standard report cover, layout, and page furniture. */
export function renderCopilotPdfReport(data: CopilotPdfReportData): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const exportedOn = new Date();
  const agentName = copilotPdfText(data.vm.summary.agentName);
  doc.setCreationDate(exportedOn);
  doc.setProperties({
    title: 'Microsoft Copilot Agent Review',
    subject: 'Selected saved Microsoft Copilot harness review; no regrading',
    author: 'Copilot Studio Kit',
    creator: 'Copilot Studio Kit local PDF exporter',
  });
  renderCsPdfCover(doc, agentName, false, {
    subtitle: 'Recorded actionable findings from the saved Microsoft Copilot review',
    sourceDescription: 'Review of saved Microsoft Copilot harness configuration',
  });
  doc.addPage();
  const layout = new CsPdfLayout(doc);
  layout.heading('Contents', 1);
  layout.paragraph('This report follows the Standard actionable maker-report format. Content remains specific to the Microsoft Copilot harness.');
  const sections = data.costReview
    ? [...CONTENTS.slice(0, -2), 'Cost and efficiency', ...CONTENTS.slice(-2)]
    : CONTENTS;
  sections.forEach((section, index) => layout.paragraph(`${index + 1}. ${section}`, {
    fontSize: 12,
    style: 'bold',
    color: '#17436b',
    gap: 3,
  }));
  layout.newPage();
  renderSummary(layout, data);
  renderScope(layout, data, exportedOn);

  const findings = numberedCopilotFindings(data.vm);
  layout.newPage();
  layout.heading('Configuration review', 1);
  renderCopilotFindings(layout, findings.filter(item =>
    item.finding.family !== 'Instructions' && item.finding.family !== 'Skills'), data.vm);
  layout.newPage();
  layout.heading('Instruction review', 1);
  copilotPdfField(layout, 'Instruction AI coverage', data.instructionCoverage);
  renderCopilotInstructionCoverage(layout, data.vm);
  renderCopilotFindings(layout, findings.filter(item => item.finding.family === 'Instructions'), data.vm);
  layout.newPage();
  renderCopilotSkills(layout, data);
  layout.heading('Recorded skill findings', 2);
  renderCopilotFindings(layout, findings.filter(item => item.finding.family === 'Skills'), data.vm);
  renderCopilotOrchestration(layout, data.vm);
  layout.newPage();
  renderImplementationOrder(layout, data);
  renderCopilotChecks(layout, data.vm);
  layout.newPage();
  renderCopilotEvidence(layout, data);
  renderCopilotCost(layout, data.costReview);
  layout.newPage();
  renderLimits(layout, data);
  renderCopilotReferences(layout, data.vm);
  layout.setContinuationContext();
  layout.finish(false, true, csPdfReportTitle(agentName));
  return doc.output('blob');
}
