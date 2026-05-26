/**
 * pdfReport.ts
 *
 * PDF report generation for pipeline agent reviews using jsPDF.
 * Ported from Agent Review Tool's csPdfUtils.ts.
 */

import { jsPDF } from 'jspdf';
import type { EvaluationResult } from '../evaluation/evaluationOrchestrator.js';
import type { PatternEvaluation, InstructionEvaluation } from '../evaluation/predictV2Client.js';
import type { ScoreResult } from '../evaluation/scoreCalculator.js';

// Brand colours
const BLUE = '#0078d4';
const GREEN = '#107c10';
const AMBER = '#b7580a';
const RED = '#c50f1f';
const GREY_LIGHT = '#f3f2f1';
const GREY_BORDER = '#e1dfdd';
const TEXT_DARK = '#201f1e';
const TEXT_MID = '#605e5c';

function scoreColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 60) return AMBER;
  return RED;
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Pass';
  if (score >= 60) return 'Warning';
  return 'Fail';
}

function severityColor(severity?: string): string {
  const s = severity?.toLowerCase();
  if (s === 'high') return RED;
  if (s === 'medium') return AMBER;
  return TEXT_MID;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Sanitize text for jsPDF standard fonts (WinAnsi/Latin-1 only) */
function sanitizeForPdf(text: string): string {
  return decodeHtmlEntities(text)
    // Smart quotes → ASCII quotes
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    // Dashes
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    // Bullets and special
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    // Arrow characters (keep → as text)
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    // Strip any remaining non-Latin-1 characters (above 0xFF)
    .replace(/[^\x00-\xFF]/g, '');
}

function hr(doc: jsPDF, y: number, margin: number, pageWidth: number): void {
  doc.setDrawColor(GREY_BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(sanitizeForPdf(text), maxWidth);
}

function sectionHeading(doc: jsPDF, text: string, y: number, margin: number): number {
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BLUE);
  doc.text(text, margin, y);
  return y + 7;
}

function checkPage(doc: jsPDF, y: number, needed: number, margin: number, pageHeight: number): number {
  if (y + needed > pageHeight - margin) {
    doc.addPage();
    return margin + 10;
  }
  return y;
}

/**
 * Generate a single-agent PDF page set.
 */
function renderAgentReport(
  doc: jsPDF,
  agentName: string,
  scores: ScoreResult,
  stageB: PatternEvaluation | undefined,
  stageC: InstructionEvaluation | undefined,
  isFirst: boolean
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  if (!isFirst) doc.addPage();
  let y = margin;

  // Header bar
  doc.setFillColor(BLUE);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#ffffff');
  doc.text('Agent Review Report', margin, 17);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Copilot Studio Kit — Pipeline', pageWidth - margin, 17, { align: 'right' });

  y = 38;

  // Agent name
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(TEXT_DARK);
  doc.text(sanitizeForPdf(agentName), margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(TEXT_MID);
  doc.text(`Reviewed: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
  y += 16;

  hr(doc, y, margin, pageWidth);
  y += 10;

  // Score cards
  const patterns = stageB?.Patterns ?? [];
  const issues = stageC?.issues ?? [];
  const failedPatterns = patterns.filter(p => !p.Status);

  const cardW = (contentWidth - 8) / 3;
  const cards = [
    { label: 'Overall Score', value: scores.overallScore, color: scoreColor(scores.overallScore), sub: scoreLabel(scores.overallScore) },
    { label: 'Pattern Score', value: scores.patternScore, color: scoreColor(scores.patternScore), sub: `${failedPatterns.length} of ${patterns.length} failed` },
    { label: 'Instruction Score', value: scores.instructionScore, color: scoreColor(scores.instructionScore), sub: `${issues.length} issue${issues.length !== 1 ? 's' : ''}` },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 4);
    doc.setFillColor(GREY_LIGHT);
    doc.roundedRect(x, y, cardW, 32, 3, 3, 'F');
    doc.setFillColor(card.color);
    doc.roundedRect(x, y, cardW, 4, 3, 3, 'F');
    doc.rect(x, y + 1, cardW, 3, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT_MID);
    doc.text(card.label, x + cardW / 2, y + 11, { align: 'center' });
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(card.color);
    doc.text(`${card.value}`, x + cardW / 2, y + 22, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT_MID);
    doc.text(card.sub, x + cardW / 2, y + 29, { align: 'center' });
  });
  y += 40;

  // Pattern Evaluation
  y = sectionHeading(doc, 'Pattern Evaluation', y, margin);
  y += 2;

  if (failedPatterns.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(RED);
    doc.text(`Failed (${failedPatterns.length})`, margin, y);
    y += 7;

    for (const p of failedPatterns) {
      y = checkPage(doc, y, 25, margin, pageHeight);
      doc.setFillColor(GREY_LIGHT);
      doc.rect(margin, y - 4, contentWidth, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(TEXT_DARK);
      doc.text(sanitizeForPdf(p.PatternName), margin + 2, y);
      doc.setFontSize(8);
      doc.setTextColor(severityColor(p.Severity));
      doc.text(p.Severity ?? '', pageWidth - margin - 2, y, { align: 'right' });
      y += 5;

      if (p.Recommendation) {
        const recLines = wrapText(doc, `-> ${p.Recommendation}`, contentWidth - 4);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(BLUE);
        doc.text(recLines, margin + 2, y);
        y += recLines.length * 4.5;
      }

      if (p.Topics?.length) {
        y = checkPage(doc, y, 8, margin, pageHeight);
        const affected = p.Topics.map((t) => (typeof t === 'string' ? t : t.item)).join(', ');
        const affectedLines = wrapText(doc, `Affected: ${affected}`, contentWidth - 4);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(TEXT_MID);
        doc.text(affectedLines, margin + 2, y);
        y += affectedLines.length * 4 + 2;
      }
      y += 4;
    }
  }

  const passedPatterns = patterns.filter(p => p.Status);
  if (passedPatterns.length > 0) {
    y = checkPage(doc, y, 12, margin, pageHeight);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GREEN);
    doc.text(`Passed (${passedPatterns.length})`, margin, y);
    y += 7;
    for (const p of passedPatterns) {
      y = checkPage(doc, y, 7, margin, pageHeight);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(TEXT_DARK);
      doc.text(`- ${sanitizeForPdf(p.PatternName)}`, margin + 2, y);
      y += 6;
    }
  }

  // Instruction Compliance
  y += 6;
  y = checkPage(doc, y, 20, margin, pageHeight);
  y = sectionHeading(doc, 'Instruction Compliance', y, margin);
  y += 2;

  if (issues.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(GREEN);
    doc.text('No compliance issues found.', margin, y);
  } else {
    for (const issue of issues) {
      y = checkPage(doc, y, 22, margin, pageHeight);
      doc.setFillColor(GREY_LIGHT);
      doc.rect(margin, y - 4, contentWidth, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(TEXT_DARK);
      doc.text(sanitizeForPdf(issue.title ?? issue.id), margin + 2, y);
      doc.setFontSize(8);
      doc.setTextColor(severityColor(issue.severity));
      doc.text(issue.severity, pageWidth - margin - 2, y, { align: 'right' });
      y += 5;

      if (issue.description) {
        const lines = wrapText(doc, issue.description, contentWidth - 4);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(TEXT_DARK);
        doc.text(lines, margin + 2, y);
        y += lines.length * 4.5 + 3;
      }
    }
  }
}

/**
 * Generate a PDF report for one or more evaluated agents.
 *
 * @param results - Array of evaluation results (one per agent)
 * @returns PDF as Buffer
 */
export function generatePdfReport(results: EvaluationResult[]): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  results.forEach((result, i) => {
    renderAgentReport(
      doc,
      result.stageA.botName ?? 'Unknown Agent',
      result.scores,
      result.stageB,
      result.stageC,
      i === 0
    );
  });

  // Footer on all pages
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT_MID);
    doc.text(
      `Agent Review Pipeline — Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}
