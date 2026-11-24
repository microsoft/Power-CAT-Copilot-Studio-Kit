/**
 * daExportUtils.ts
 *
 * Excel export for DA reviews.
 * Review workbook:
 *   1. Summary  — one row per agent (aggregate scores)
 *   2. Detail   — one row per issue or non-scored assessment note
 *   3. Passing  — one row per passing check per criterion (what went well)
 *   4. Package Findings — deterministic package-validity evidence
 *   5. Workflow Provenance — workflow contract traceability when available
 */

import ExcelJS from 'exceljs';
import { reviewBrandArgb } from '../../agents-experience/components/copilotStudioReviewTheme';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type { EvaluationStatus, IssueSeverity } from '../contracts/DAEvaluationResult';
import { DA_SCORE_THRESHOLDS } from '../contracts/constants';
import { criterionScore } from './scoreCalculator';
import { buildDAReviewShellModel } from '../adapters/daReviewShellModel';

const HEADER_COLOR = reviewBrandArgb;
const WHITE = 'FFFFFFFF';

function getScoreStatus(score: number | null): EvaluationStatus {
  if (score === null) return 'Not assessed';
  if (score >= DA_SCORE_THRESHOLDS.PASS) return 'Pass';
  if (score >= DA_SCORE_THRESHOLDS.WARNING) return 'Warning';
  return 'Fail';
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: WHITE } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 20;
}

function applySeverityFormatting(cell: ExcelJS.Cell, severity?: IssueSeverity): void {
  switch (severity) {
    case 'High':
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA80000' } };
      cell.font = { color: { argb: WHITE }, bold: true };
      break;
    case 'Medium':
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD83B01' } };
      cell.font = { color: { argb: WHITE }, bold: true };
      break;
    case 'Low':
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } };
      cell.font = { color: { argb: WHITE } };
      break;
    default:
      break;
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

function applyStatusFormatting(cell: ExcelJS.Cell, status: EvaluationStatus): void {
  switch (status) {
    case 'Pass':
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107C10' } };
      cell.font = { color: { argb: WHITE }, bold: true };
      break;
    case 'Warning':
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD83B01' } };
      cell.font = { color: { argb: WHITE }, bold: true };
      break;
    case 'Fail':
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA80000' } };
      cell.font = { color: { argb: WHITE }, bold: true };
      break;
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

export async function buildDAExcelWorkbook(reviews: DAReviewRecord[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Copilot Agent Kit — DA Review';
  workbook.created = new Date();

  addDASummarySheet(workbook, reviews);
  addDADetailSheet(workbook, reviews);
  addDAPassingSheet(workbook, reviews);
  addDAPackageFindingsSheet(workbook, reviews);
  addDAWorkflowProvenanceSheet(workbook, reviews);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Sheet 1: Summary — one row per agent with aggregate scores.
 */
function addDASummarySheet(workbook: ExcelJS.Workbook, reviews: DAReviewRecord[]): void {
  const sheet = workbook.addWorksheet('Summary');

  sheet.columns = [
    { header: 'Agent Name', key: 'name', width: 30 },
    { header: 'Version', key: 'version', width: 12 },
    { header: 'Publisher', key: 'publisher', width: 25 },
    { header: 'Quality Score', key: 'score', width: 15 },
    { header: 'Package Validity', key: 'packageValidity', width: 20 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Total Issues', key: 'issues', width: 13 },
    { header: 'Source', key: 'source', width: 10 },
    { header: 'Last Reviewed', key: 'reviewedOn', width: 20 },
    { header: 'AI Summary', key: 'summary', width: 60 },
  ];

  styleHeaderRow(sheet.getRow(1));

  for (const r of reviews) {
    const model = buildDAReviewShellModel(r);
    const score = model.score;
    const statusText = getScoreStatus(score);
    const row = sheet.addRow({
      name: r.agentName ?? '',
      version: r.agentVersion ?? '',
      publisher: r.publisherName ?? '',
      score: score ?? 'Not assessed',
      packageValidity: model.packageValidity ?? 'Unavailable',
      status: statusText,
      issues: r.totalIssues ?? model.severity.total,
      source: r.sourceType === 'zip' ? 'ZIP' : 'Catalog',
      reviewedOn: r.reviewedOn ? r.reviewedOn.toLocaleDateString() : '',
      summary: r.evaluation?.summary ?? '',
    });

    // Color-code score cell
    const scoreCell = row.getCell('D');
    if (score !== null && score >= DA_SCORE_THRESHOLDS.PASS) {
      scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107C10' } };
    } else if (score !== null && score >= DA_SCORE_THRESHOLDS.WARNING) {
      scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD83B01' } };
    } else if (score !== null) {
      scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA80000' } };
    }
    scoreCell.font = score === null
      ? { italic: true }
      : { color: { argb: WHITE }, bold: true };
    scoreCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Color-code status cell
    applyStatusFormatting(row.getCell('F'), statusText as EvaluationStatus);

    row.getCell('J').alignment = { wrapText: true, vertical: 'top' };
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Sheet 2: Detail — one row per issue or non-scored assessment note.
 */
function addDADetailSheet(workbook: ExcelJS.Workbook, reviews: DAReviewRecord[]): void {
  const sheet = workbook.addWorksheet('Issues Detail');

  sheet.columns = [
    { header: 'Agent Name', key: 'name', width: 28 },
    { header: 'Criterion', key: 'criterion', width: 28 },
    { header: 'Weight', key: 'weight', width: 10 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Record Type', key: 'recordType', width: 18 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Rule ID', key: 'ruleId', width: 30 },
    { header: 'Method', key: 'method', width: 14 },
    { header: 'Source File', key: 'sourceFile', width: 36 },
    { header: 'JSON Path', key: 'jsonPath', width: 36 },
    { header: 'Evidence', key: 'evidence', width: 55 },
    { header: 'Description', key: 'issue', width: 55 },
    { header: 'Recommendation', key: 'recommendation', width: 60 },
    { header: 'Guidance URL', key: 'guidanceUrl', width: 48 },
  ];

  styleHeaderRow(sheet.getRow(1));

  for (const r of reviews) {
    const model = buildDAReviewShellModel(r);
    for (const section of model.sections) {
      if (section.tab === 'package' || !section.result) continue;

      const criterion = section.result;
      const score = criterionScore(criterion);
      const weight = section.weightLabel ?? 'Not scored';

      if (criterion.issues.length === 0 && (criterion.assessmentNotes?.length ?? 0) === 0) {
        const row = sheet.addRow({
          name: r.agentName ?? '',
          criterion: section.criterionName,
          weight,
          score: score ?? 'Not assessed',
          status: criterion.status,
          recordType: 'Result',
          severity: '',
          issue: 'No issues found',
          recommendation: '',
        });
        applyStatusFormatting(row.getCell('E'), criterion.status);
      } else {
        for (const issue of criterion.issues) {
          const row = sheet.addRow({
            name: r.agentName ?? '',
            criterion: section.criterionName,
            weight,
            score: score ?? 'Not assessed',
            status: criterion.status,
            recordType: 'Issue',
            severity: issue.severity,
            ruleId: issue.ruleId ?? '',
            method: issue.method ?? '',
            sourceFile: issue.sourceFile ?? '',
            jsonPath: issue.jsonPath ?? '',
            evidence: issue.evidence ?? '',
            issue: issue.description ?? '',
            recommendation: issue.recommendation ?? '',
            guidanceUrl: issue.guidanceUrl ?? '',
          });
          applyStatusFormatting(row.getCell('E'), criterion.status);
          applySeverityFormatting(row.getCell('G'), issue.severity);
          for (const column of ['L', 'M', 'N', 'O']) {
            row.getCell(column).alignment = { wrapText: true, vertical: 'top' };
          }
        }
      }

      for (const note of criterion.assessmentNotes ?? []) {
        const row = sheet.addRow({
          name: r.agentName ?? '',
          criterion: section.criterionName,
          weight,
          score: 'Not assessed',
          status: note.status,
          recordType: 'Assessment note',
          severity: '',
          sourceFile: note.sourceFile ?? '',
          jsonPath: note.jsonPath ?? '',
          evidence: note.evidence ?? '',
          issue: note.description,
          recommendation: '',
          guidanceUrl: note.learnUrl ?? '',
        });
        applyStatusFormatting(row.getCell('E'), note.status);
        for (const column of ['L', 'M', 'N', 'O']) {
          row.getCell(column).alignment = { wrapText: true, vertical: 'top' };
        }
      }
    }
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Sheet 3: Passing Checks — one row per passing check per criterion.
 * Shows what the agent did well, per criterion.
 */
function addDAPassingSheet(workbook: ExcelJS.Workbook, reviews: DAReviewRecord[]): void {
  const sheet = workbook.addWorksheet('Passing Checks');

  sheet.columns = [
    { header: 'Agent Name', key: 'name', width: 28 },
    { header: 'Criterion', key: 'criterion', width: 28 },
    { header: 'Weight', key: 'weight', width: 10 },
    { header: 'Passing Check', key: 'check', width: 70 },
    { header: 'Guidance URL', key: 'guidanceUrl', width: 48 },
  ];

  styleHeaderRow(sheet.getRow(1));

  for (const r of reviews) {
    const model = buildDAReviewShellModel(r);
    for (const section of model.sections) {
      if (section.tab === 'package' || !section.result) continue;

      const checks = section.result.passingChecks ?? [];
      const weight = section.weightLabel ?? 'Not scored';

      if (checks.length === 0) {
        sheet.addRow({
          name: r.agentName ?? '',
          criterion: section.criterionName,
          weight,
          check: '(no passing checks recorded)',
        });
      } else {
        for (const check of checks) {
          const row = sheet.addRow({
            name: r.agentName ?? '',
            criterion: section.criterionName,
            weight,
            check: check.description ?? '',
            guidanceUrl: check.learnUrl ?? '',
          });
          // Light green tint for passing rows
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
          });
          row.getCell('D').alignment = { wrapText: true, vertical: 'top' };
          row.getCell('E').alignment = { wrapText: true, vertical: 'top' };
        }
      }
    }
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addDAPackageFindingsSheet(
  workbook: ExcelJS.Workbook,
  reviews: DAReviewRecord[],
): void {
  const sheet = workbook.addWorksheet('Package Findings');
  sheet.columns = [
    { header: 'Agent Name', key: 'name', width: 28 },
    { header: 'Package Validity', key: 'validity', width: 20 },
    { header: 'Rule ID', key: 'ruleId', width: 32 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Method', key: 'method', width: 14 },
    { header: 'Source File', key: 'sourceFile', width: 36 },
    { header: 'JSON Path', key: 'jsonPath', width: 36 },
    { header: 'Evidence', key: 'evidence', width: 55 },
    { header: 'Explanation', key: 'explanation', width: 55 },
    { header: 'Recommendation', key: 'recommendation', width: 60 },
    { header: 'Guidance URL', key: 'guidanceUrl', width: 48 },
  ];
  styleHeaderRow(sheet.getRow(1));

  for (const review of reviews) {
    for (const finding of review.packageValidation?.findings ?? []) {
      const row = sheet.addRow({
        name: review.agentName ?? '',
        validity: review.packageValidation?.status ?? 'Unavailable',
        ruleId: finding.ruleId,
        status: finding.status,
        severity: finding.severity ?? '',
        method: finding.method,
        sourceFile: finding.sourceFile,
        jsonPath: finding.jsonPath,
        evidence: finding.evidence,
        explanation: finding.explanation,
        recommendation: finding.recommendation,
        guidanceUrl: finding.guidanceUrl ?? '',
      });
      applyStatusFormatting(row.getCell('D'), finding.status);
      applySeverityFormatting(row.getCell('E'), finding.severity);
      for (const column of ['I', 'J', 'K', 'L']) {
        row.getCell(column).alignment = { wrapText: true, vertical: 'top' };
      }
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addDAWorkflowProvenanceSheet(
  workbook: ExcelJS.Workbook,
  reviews: DAReviewRecord[],
): void {
  const sheet = workbook.addWorksheet('Workflow Provenance');
  sheet.columns = [
    { header: 'Agent Name', key: 'name', width: 28 },
    { header: 'Contract Version', key: 'contractVersion', width: 18 },
    { header: 'Correlation ID', key: 'correlationId', width: 38 },
    { header: 'Job ID', key: 'jobId', width: 38 },
    { header: 'Completed At', key: 'completedAt', width: 24 },
    { header: 'Rejected Outcomes', key: 'rejectedOutcomes', width: 20 },
  ];
  styleHeaderRow(sheet.getRow(1));

  for (const review of reviews) {
    if (!review.workflowProvenance) continue;
    sheet.addRow({
      name: review.agentName ?? '',
      contractVersion: review.workflowProvenance.contractVersion,
      correlationId: review.workflowProvenance.correlationId,
      jobId: review.workflowProvenance.jobId ?? '',
      completedAt: review.workflowProvenance.completedAt,
      rejectedOutcomes: review.workflowProvenance.rejectedOutcomeCount,
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
