import { jsPDF } from 'jspdf';
import { CsPdfLayout } from '../../utils/csPdfLayout';
import { csPdfReportTitle, renderCsPdfCover } from '../../utils/csPdfTemplate';
import { PDF_FONT_NOTICE } from '../../utils/csPdfText';
import {
  buildReviewSkillGradeExportRows, renderReviewPdfOrchestration, renderReviewPdfSkills,
} from '../../utils/reviewPdfContent';
import { buildDAReviewShellModel, type DAReviewShellModel } from '../adapters/daReviewShellModel';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import {
  buildDAPdfFindings, DA_PDF_SEVERITY, daPdfField, daPdfText,
  renderDAPdfFindings, renderDAPdfReferences, type DAPdfFinding,
} from './daPdfContent';
import { renderDACriterionEvidence, renderDARecordedChecks } from './daPdfChecks';

const CONTENTS = [
  'Executive summary', 'Review scope', 'Quality review', 'Package validity',
  'Custom skills and resources', 'Recommended implementation order',
  'Tests to run after changes', 'All recorded checks',
  'Validation record and limits', 'Official references',
];

function number(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function renderSummary(layout: CsPdfLayout, review: DAReviewRecord, model: DAReviewShellModel): void {
  layout.heading('Executive summary', 1);
  layout.paragraph(`This report presents the saved M365 Declarative Agent assessment for ${daPdfText(review.agentName)}.`);
  layout.heading('Saved review scores', 2);
  daPdfField(layout, 'Quality score', model.score === null ? 'Not assessed' : `${model.score} / 100`, { style: 'bold' });
  daPdfField(layout, 'Package validity', model.packageValidity === 'unavailable' ? 'Not assessed' : model.packageValidity);
  layout.paragraph('Package validity, N/A, and Not assessed results do not affect the quality score.', { fontSize: 8.5 });
  layout.paragraph('Custom-skill quality is separate from the M365 quality score.', { fontSize: 8.5 });
  layout.heading('Finding summary', 2);
  layout.table(['Severity', 'Recorded issues'], [
    ['High', String(model.severity.high)], ['Medium', String(model.severity.medium)],
    ['Low', String(model.severity.low)], ['Total', String(model.severity.total)],
  ], { columnRatios: [2, 1] });
  layout.paragraph('Issue counts are separate from criterion and package-check counts. Execution issues are identified separately.');
  if (model.aiSummary) {
    layout.heading('Saved quality summary', 2);
    layout.paragraph(daPdfText(model.aiSummary));
  }
  layout.heading('Quality score calculation', 2);
  if (!model.scoreBreakdown.length) {
    layout.paragraph('No criterion breakdown was saved. The saved quality score is retained when available; no weights are reconstructed.');
    return;
  }
  layout.paragraph('Pass = 100; Warning = 60; Fail = 0. N/A and Not assessed criteria are excluded.');
  layout.paragraph('Configured weights are redistributed among assessed criteria. The final total is rounded once; displayed contributions use two decimal places.');
  layout.table(['Criterion', 'Status', 'Score', 'Configured weight', 'Effective weight', 'Contribution'],
    model.scoreBreakdown.map(part => [
      part.label, part.status, part.score === null ? 'Not assessed' : String(part.score),
      `${number(part.configuredWeight * 100)}%`, `${number(part.effectiveWeight)}%`,
      part.score === null ? 'Excluded' : number(part.points),
    ]), { columnRatios: [2.1, 1.2, 1, 1.2, 1.2, 1.1], fontSize: 8 });
}

function renderScope(layout: CsPdfLayout, review: DAReviewRecord, model: DAReviewShellModel, exportedOn: Date): void {
  layout.heading('Review scope', 1);
  layout.paragraph('One saved M365 Declarative Agent review. This export does not retrieve new source data or run a new assessment.');
  const date = review.reviewedOn;
  const reviewedOn = date === undefined ? 'Not recorded'
    : date instanceof Date && Number.isFinite(date.getTime())
      ? `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'Invalid saved review date';
  for (const [label, value] of [
    ['Agent', review.agentName], ['Agent version', review.agentVersion],
    ['Publisher', review.publisherName], ['Source', model.sourceLabel],
    ['Review date', reviewedOn], ['Export date', `${exportedOn.toISOString().slice(0, 19).replace('T', ' ')} UTC`],
    ['Package schema', review.packageValidation?.schemaVersion ?? review.manifestHealth?.schemaVersion],
  ] as const) daPdfField(layout, label, value);
}

function renderQuality(layout: CsPdfLayout, model: DAReviewShellModel, findings: readonly DAPdfFinding[]): void {
  layout.heading('Quality review', 1);
  for (const section of model.sections.filter(item => item.tab !== 'package')) {
    layout.setContinuationContext(section.criterionName);
    layout.heading(section.criterionName, 2);
    daPdfField(layout, 'Status', section.result?.status ?? 'Not assessed');
    const breakdown = model.scoreBreakdown.find(part => part.key === section.criterionKey);
    if (breakdown) daPdfField(layout, 'Score contribution', breakdown.score === null
      ? 'Excluded from the quality score' : `${number(breakdown.points)} points (${number(breakdown.effectiveWeight)}% effective weight)`);
    renderDAPdfFindings(layout, findings.filter(finding => finding.tab === section.tab));
    layout.setContinuationContext(section.criterionName);
    renderDACriterionEvidence(layout, section);
  }
  layout.setContinuationContext();
}

function renderSkills(layout: CsPdfLayout, review: DAReviewRecord, model: DAReviewShellModel, findings: readonly DAPdfFinding[]): void {
  const skills = model.customSkills?.skills ?? [];
  renderReviewPdfSkills(layout, { skills, skillGrades: buildReviewSkillGradeExportRows({ skills }) }, 'Custom skills and resources');
  layout.paragraph('Custom-skill quality is separate from the M365 quality score.');
  renderDAPdfFindings(layout, findings.filter(finding => finding.tab === 'customSkills'));
  if (model.customSkills) renderReviewPdfOrchestration(layout, model.customSkills.grouped);
  const issues = review.customSkillIssues?.filter(issue => issue.severity !== 'info') ?? [];
  if (issues.length) layout.heading('Custom-skill execution issues', 2);
  for (const issue of issues) {
    layout.setContinuationContext(`Execution issue - ${daPdfText(issue.code)}`);
    layout.heading(daPdfText(issue.code), 3);
    daPdfField(layout, 'Recorded execution issue', issue.message);
    daPdfField(layout, 'Source file', issue.resourcePath);
    layout.paragraph('No maker action was recorded for this execution issue.');
  }
  layout.setContinuationContext();
}

function renderImplementationOrder(layout: CsPdfLayout, findings: readonly DAPdfFinding[]): void {
  layout.heading('Recommended implementation order', 1);
  layout.paragraph('Review High findings first, followed by Medium and Low findings. Use each recorded maker action and product disposition.');
  const ordered = [...findings].sort((a, b) => DA_PDF_SEVERITY[a.issue.severity].rank - DA_PDF_SEVERITY[b.issue.severity].rank);
  if (!ordered.length) layout.paragraph('No issue was recorded. Check assessment limits before concluding that the review is complete.');
  ordered.forEach((finding, index) => layout.paragraph(
    `${index + 1}. ${finding.label} - ${daPdfText(finding.title ?? finding.category)} | ${finding.issue.severity}`,
    { fontSize: 8.5, style: 'bold', gap: 1.25 },
  ));
  layout.heading('Tests to run after changes', 1);
  layout.paragraph('General verification guidance, not recorded acceptance-test results: repeat the M365 review after changes and confirm that the related issue is resolved.');
  ordered.forEach(finding => daPdfField(layout, finding.label,
    `Recheck recorded rule ${daPdfText(finding.issue.ruleId)} after its saved maker action.`));
}

function renderLimits(layout: CsPdfLayout, review: DAReviewRecord): void {
  layout.heading('Validation record and limits', 1);
  for (const limit of [
    'Report source: one saved M365 Declarative Agent review. This export made no AI call.',
    'The quality score uses the same M365 projection as the review page. Standard harness weights are not used.',
    'N/A and Not assessed criteria are excluded. Package validity and custom-skill quality remain separate.',
    'No passing check, zero skill grade, evidence, or maker action is inferred from unavailable data.',
    'Legacy manifest-health checks do not establish current package validity.',
    'Passing checks and applicability notes retain their recorded meaning; execution issues are not additional agent defects.',
    'Raw instructions, retained source documents, SKILL.md text, file bytes, source hashes, and prompt payloads are not exported.',
    'Secret-like values and signed URLs are redacted again when report fields are rendered.',
  ]) layout.paragraph(limit, { fontSize: 8.5, gap: 1.25 });
  if (review.workflowProvenance) {
    layout.heading('Workflow provenance', 2);
    const provenance = review.workflowProvenance;
    for (const [label, value] of [
      ['Contract version', provenance.contractVersion], ['Correlation ID', provenance.correlationId],
      ['Job ID', provenance.jobId], ['Completed at', provenance.completedAt],
      ['Rejected outcomes', provenance.rejectedOutcomeCount],
    ] as const) daPdfField(layout, label, value);
  } else layout.paragraph('Workflow provenance was not recorded for this review.');
  layout.paragraph(PDF_FONT_NOTICE, { fontSize: 8, gap: 0.75 });
}

/** Render saved M365 results with the Standard cover, measured layout, and page furniture. */
export function renderDAPdfReport(review: DAReviewRecord): Blob {
  const model = buildDAReviewShellModel(review);
  const findings = buildDAPdfFindings(review, model);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const exportedOn = new Date();
  const agentName = daPdfText(review.agentName);
  doc.setCreationDate(exportedOn);
  doc.setProperties({
    title: 'M365 Declarative Agent Review', subject: 'Selected saved M365 review; no new assessment',
    author: 'Copilot Studio Kit', creator: 'Copilot Studio Kit local PDF exporter',
  });
  renderCsPdfCover(doc, agentName, false, {
    subtitle: 'Recorded actionable findings from the saved M365 Declarative Agent review',
    sourceDescription: 'Review of saved M365 Declarative Agent configuration',
  });
  doc.addPage();
  const layout = new CsPdfLayout(doc);
  layout.heading('Contents', 1);
  layout.paragraph('This report follows the Standard actionable maker-report format. Results remain specific to the M365 Declarative Agent review.');
  CONTENTS.forEach((section, index) => layout.paragraph(`${index + 1}. ${section}`, {
    fontSize: 12, style: 'bold', color: '#17436b', gap: 3,
  }));
  layout.newPage();
  renderSummary(layout, review, model);
  renderScope(layout, review, model, exportedOn);
  layout.newPage();
  renderQuality(layout, model, findings);
  layout.newPage();
  layout.heading('Package validity', 1);
  daPdfField(layout, 'Package validity', model.packageValidity === 'unavailable' ? 'Not assessed' : model.packageValidity);
  renderDAPdfFindings(layout, findings.filter(finding => finding.tab === 'package'));
  layout.newPage();
  renderSkills(layout, review, model, findings);
  layout.newPage();
  renderImplementationOrder(layout, findings);
  renderDARecordedChecks(layout, review, model, findings);
  layout.newPage();
  renderLimits(layout, review);
  renderDAPdfReferences(layout, review, model, findings);
  layout.finish(false, true, csPdfReportTitle(agentName));
  return doc.output('blob');
}
