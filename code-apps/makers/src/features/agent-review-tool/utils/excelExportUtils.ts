/**
 * Excel Export Utilities
 *
 * Generates Excel workbook with 3 sheets:
 * 1. Summary: All reviews with scores
 * 2. Patterns: All patterns with one row per affected topic
 * 3. Compliance: All compliance issues grouped by criteria category
 *
 * Uses ExcelJS for workbook generation with formatting.
 */

import ExcelJS from 'exceljs';
import { reviewBrandArgb } from '../agents-experience/components/copilotStudioReviewTheme';
import type { ReviewResult } from '../contracts/ReviewResult';
import type { Pattern, ComplianceIssue } from '../contracts/StageOutputs';

const HEADER_COLOR = reviewBrandArgb;
const WHITE = 'FFFFFFFF';

/**
 * Generate Excel workbook from review results.
 *
 * @param reviews - Array of review results
 * @returns Excel workbook as Blob
 */
export async function generateExcelExport(
  reviews: ReviewResult[]
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Copilot Studio Agent Review Tool';
  workbook.created = new Date();
  workbook.modified = new Date();

  addSummarySheet(workbook, reviews);
  addPatternsSheet(workbook, reviews);
  addComplianceSheet(workbook, reviews);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: WHITE } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 20;
}

function addSummarySheet(workbook: ExcelJS.Workbook, reviews: ReviewResult[]): void {
  const sheet = workbook.addWorksheet('Summary');

  sheet.columns = [
    { header: 'Bot Name', key: 'botName', width: 30 },
    { header: 'Overall Score', key: 'overallScore', width: 15 },
    { header: 'Pattern Score', key: 'patternScore', width: 15 },
    { header: 'Instruction Score', key: 'instructionScore', width: 18 },
    { header: 'Total Issues', key: 'totalIssues', width: 12 },
    { header: 'High Severity', key: 'highSeverity', width: 15 },
    { header: 'Medium Severity', key: 'mediumSeverity', width: 18 },
    { header: 'Low Severity', key: 'lowSeverity', width: 15 },
    { header: 'Reviewed On', key: 'reviewedOn', width: 20 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  styleHeaderRow(sheet.getRow(1));

  reviews.forEach((review) => {
    sheet.addRow({
      botName: review.botName,
      overallScore: review.overallScore,
      patternScore: review.patternScore,
      instructionScore: review.instructionScore,
      totalIssues: review.totalIssueCount,
      highSeverity: review.highSeverityCount,
      mediumSeverity: review.mediumSeverityCount,
      lowSeverity: review.lowSeverityCount,
      reviewedOn: review.reviewedOn.toLocaleString(),
      status: review.status,
    });
  });

  applyScoreFormatting(sheet, 'B', reviews.length);
  applyScoreFormatting(sheet, 'C', reviews.length);
  applyScoreFormatting(sheet, 'D', reviews.length);

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Patterns sheet — one row per affected topic per pattern.
 * If a pattern has no topics, one summary row is written with Topic Name = '(no topics affected)'.
 * Topic-level detail columns (Variable, Current Value, Suggested) are populated where available.
 */
function addPatternsSheet(workbook: ExcelJS.Workbook, reviews: ReviewResult[]): void {
  const sheet = workbook.addWorksheet('Patterns');

  sheet.columns = [
    { header: 'Bot Name', key: 'botName', width: 30 },
    { header: 'Pattern ID', key: 'patternId', width: 22 },
    { header: 'Pattern Name', key: 'patternName', width: 35 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Topic Name', key: 'topicName', width: 30 },
    { header: 'Variable', key: 'variable', width: 20 },
    { header: 'Current Value', key: 'current', width: 25 },
    { header: 'Suggested Value', key: 'suggested', width: 25 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Recommendation', key: 'recommendation', width: 50 },
  ];

  styleHeaderRow(sheet.getRow(1));

  reviews.forEach((review) => {
    if (!review.stageBOutput) return;

    let patterns: Pattern[] = [];
    try {
      const stageB = JSON.parse(review.stageBOutput) as { Patterns?: Pattern[] };
      patterns = stageB.Patterns ?? [];
    } catch (err) {
      console.error(`[ExcelExport] Failed to parse Stage B for "${review.botName}":`, err);
      return;
    }

    patterns.forEach((pattern) => {
      const topics = pattern.Topics ?? [];
      const description = pattern.Description ?? pattern.PatternDescription ?? '';

      if (topics.length === 0) {
        // One summary row — no topic-level detail
        const row = sheet.addRow({
          botName: review.botName,
          patternId: pattern.PatternId ?? '',
          patternName: pattern.PatternName ?? '',
          category: pattern.Category ?? 'Unknown',
          severity: pattern.Severity ?? 'Low',
          status: pattern.Status ? 'Pass' : 'Fail',
          topicName: '(no topics affected)',
          variable: '',
          current: '',
          suggested: '',
          description,
          recommendation: pattern.Recommendation ?? '',
        });
        applySeverityFormatting(row.getCell('E'), pattern.Severity);
        applyStatusFormatting(row.getCell('F'), pattern.Status);
      } else {
        // One row per topic — shared pattern fields repeated for easy filtering
        topics.forEach((topic) => {
          const row = sheet.addRow({
            botName: review.botName,
            patternId: pattern.PatternId ?? '',
            patternName: pattern.PatternName ?? '',
            category: pattern.Category ?? 'Unknown',
            severity: pattern.Severity ?? 'Low',
            status: pattern.Status ? 'Pass' : 'Fail',
            topicName: topic.item ?? '',
            variable: topic.variable ?? '',
            current: topic.current ?? '',
            suggested: topic.suggested ?? '',
            description,
            recommendation: pattern.Recommendation ?? '',
          });
          applySeverityFormatting(row.getCell('E'), pattern.Severity);
          applyStatusFormatting(row.getCell('F'), pattern.Status);
        });
      }
    });
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Compliance sheet — one row per issue, with Category column.
 * Alternating light shading per criteria group for readability.
 */
function addComplianceSheet(workbook: ExcelJS.Workbook, reviews: ReviewResult[]): void {
  const sheet = workbook.addWorksheet('Compliance');

  sheet.columns = [
    { header: 'Bot Name', key: 'botName', width: 30 },
    { header: 'Criteria ID', key: 'criteriaId', width: 25 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Issue Title', key: 'title', width: 35 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Recommendation', key: 'recommendation', width: 50 },
  ];

  styleHeaderRow(sheet.getRow(1));

  reviews.forEach((review) => {
    if (!review.stageCOutput) return;

    let issues: ComplianceIssue[] = [];
    try {
      const stageC = JSON.parse(review.stageCOutput) as { issues?: ComplianceIssue[] };
      issues = stageC.issues ?? [];
    } catch (err) {
      console.error(`[ExcelExport] Failed to parse Stage C for "${review.botName}":`, err);
      return;
    }

    // Track categories seen so far to alternate row shading per group
    let lastCategory = '';
    let shadingToggle = false;

    issues.forEach((issue) => {
      const category = issue.category ?? issue.criteriaId ?? 'General';

      if (category !== lastCategory) {
        shadingToggle = !shadingToggle;
        lastCategory = category;
      }

      const row = sheet.addRow({
        botName: review.botName,
        criteriaId: issue.criteriaId ?? issue.id ?? '',
        category,
        title: issue.title ?? '',
        severity: issue.severity ?? 'Low',
        description: issue.description ?? '',
        recommendation: issue.recommendation ?? '',
      });

      // Alternating group background (very light grey vs white)
      if (shadingToggle) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          // Only shade if not already colored by severity
          if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          }
        });
      }

      applySeverityFormatting(row.getCell('E'), issue.severity);
    });
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyScoreFormatting(sheet: ExcelJS.Worksheet, column: string, totalRows: number): void {
  for (let i = 2; i <= totalRows + 1; i++) {
    const cell = sheet.getCell(`${column}${i}`);
    const score = cell.value as number;
    if (score >= 80) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107C10' } };
    } else if (score >= 60) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD83B01' } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA80000' } };
    }
    cell.font = { color: { argb: WHITE }, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}

function applySeverityFormatting(
  cell: ExcelJS.Cell,
  severity?: 'High' | 'Medium' | 'Low'
): void {
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

function applyStatusFormatting(cell: ExcelJS.Cell, status: boolean): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: status ? 'FF107C10' : 'FFA80000' },
  };
  cell.font = { color: { argb: WHITE }, bold: true };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}
