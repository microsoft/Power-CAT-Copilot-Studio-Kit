import { jsPDF } from 'jspdf';
import { copilotStudioReviewBrand } from '../../agent-review-tool/agents-experience/components/copilotStudioReviewTheme';
import { formatWhen, type EvaluationResultVM, type EvaluationRunVM } from '../contracts/model-assessment';
import { metricDisplayName } from '../contracts/metric-display';
import { presentAnalysis, type AnalysisSection } from '../contracts/analysis-presentation';
import { creditsBreakdown, creditsTotal, formatCredits } from '../contracts/credits';
import type { RecommendationReport } from '../contracts/recommendation-display';

export interface ComparisonExportRun {
  run: EvaluationRunVM;
  model: string;
}

export interface ComparisonExportRow {
  testSet?: string;
  /** Identifies the test case, so different cases with the same question stay separate. */
  caseKey?: string;
  questions: string[];
  metric: string;
  /** Name of the Business Classification test method, when its test set has several. */
  grader?: string;
  /** One cell per exported run, in the same order as the runs. `text` is shown as-is instead of a status badge. */
  cells: Array<{ status?: string; finding?: string; text?: string }>;
}

export interface ComparisonExport {
  agentName?: string;
  runs: ComparisonExportRun[];
  rows: ComparisonExportRow[];
  /** Results of the exported runs, used to show readable questions in the AI summary. */
  results?: EvaluationResultVM[];
  /** Model recommendation, when one was generated for the two exported runs. */
  recommendation?: RecommendationReport;
}

type Rgb = [number, number, number];

const BRAND: Rgb = (() => {
  const hex = copilotStudioReviewBrand[80].replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.substring(i, i + 2), 16)) as Rgb;
})();
const TEXT: Rgb = [36, 36, 36];
const MUTED: Rgb = [97, 97, 97];
const BORDER: Rgb = [214, 214, 214];
const STATUS_STYLE: Record<string, { fill: Rgb; text: Rgb }> = {
  pass: { fill: [223, 246, 221], text: [16, 124, 16] },
  fail: { fill: [253, 231, 233], text: [196, 49, 75] },
  error: { fill: [255, 244, 206], text: [131, 91, 0] },
};
const REGRESSION_COLOR: Record<string, Rgb> = {
  healthy: [16, 124, 16], warning: [131, 91, 0], critical: [196, 49, 75],
};

/** Keep conversation questions in order, one unnumbered question per line. */
export function questionsCell(questions: string[]): string {
  return questions.join('\n');
}

/** jsPDF's built-in fonts only cover Latin-1; map common typography and drop the rest. */
export function pdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\n\t\x20-\x7E\u00A1-\u00FF]/g, '?');
}

/** Build the comparison report: run overview, model recommendation and AI summary per run, then results by test set. */
export function buildComparisonPdf(data: ComparisonExport): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const bottom = pageH - 16;
  let y = margin;

  const setColor = (rgb: Rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const font = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: Rgb = TEXT) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    setColor(color);
  };
  const lineH = (size: number) => size * 0.3528 * 1.25;
  const wrap = (text: string, width: number): string[] => doc.splitTextToSize(pdfText(text), width) as string[];
  const ensure = (needed: number) => {
    if (y + needed <= bottom) return false;
    doc.addPage();
    y = margin;
    return true;
  };
  const paragraph = (text: string, size: number, x = margin, width = contentW, style: 'normal' | 'bold' | 'italic' = 'normal', color: Rgb = TEXT) => {
    font(size, style, color);
    for (const line of wrap(text, width)) {
      ensure(lineH(size));
      doc.text(line, x, y + lineH(size) * 0.75);
      y += lineH(size);
    }
  };
  const heading = (title: string) => {
    ensure(24);
    y += 10;
    font(13, 'bold', BRAND);
    doc.text(pdfText(title), margin, y + 4.5);
    y += 6.5;
    doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  // Title band
  const agent = data.agentName?.trim() || 'Agent';
  const runs = data.runs;
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.rect(0, 0, pageW, 30, 'F');
  font(18, 'bold', [255, 255, 255]);
  doc.text('Model Assessment Report', margin, 13);
  font(10, 'normal', [255, 255, 255]);
  doc.text(pdfText(`${agent}  |  ${runs.map((item) => item.model).join(' vs ')}`), margin, 20, { maxWidth: contentW });
  doc.text(pdfText(`Generated ${formatWhen(new Date().toISOString())}`), margin, 25.5);
  y = 34;

  // Run overview
  heading('Runs compared');
  // Only Microsoft Copilot harness runs report credits; other reports keep the original columns.
  const hasCredits = runs.some((item) => item.run.credits);
  const overview = [
    { title: 'Model', width: hasCredits ? 38 : 44, value: (item: ComparisonExportRun) => item.model },
    { title: 'Completed', width: hasCredits ? 32 : 34, value: (item: ComparisonExportRun) => formatWhen(item.run.completedOn ?? item.run.startedOn) },
    { title: 'Status', width: hasCredits ? 26 : 30, value: (item: ComparisonExportRun) => item.run.status },
    { title: 'Regression', width: 22, value: (item: ComparisonExportRun) => item.run.regression },
    { title: 'Pass', width: hasCredits ? 11 : 12, value: (item: ComparisonExportRun) => String(item.run.pass) },
    { title: 'Fail', width: hasCredits ? 11 : 12, value: (item: ComparisonExportRun) => String(item.run.fail) },
    { title: 'Error', width: hasCredits ? 11 : 12, value: (item: ComparisonExportRun) => String(item.run.error) },
    { title: 'Excl.', width: hasCredits ? 11 : contentW - 166, value: (item: ComparisonExportRun) => String(item.run.excluded) },
    ...(hasCredits ? [{
      title: 'Credits',
      width: contentW - 162,
      value: (item: ComparisonExportRun) => {
        const credits = item.run.credits;
        return credits ? `${formatCredits(creditsTotal(credits))}${credits.partial ? ' (partial)' : ''}` : '-';
      },
    }] : []),
  ];
  const tableHeader = (columns: Array<{ title: string; width: number }>) => {
    doc.setFillColor(243, 243, 243);
    doc.rect(margin, y, contentW, 7, 'F');
    font(8.5, 'bold', MUTED);
    let x = margin;
    for (const column of columns) {
      doc.text(pdfText(column.title), x + 2, y + 4.8, { maxWidth: column.width - 3 });
      x += column.width;
    }
    y += 7;
  };
  tableHeader(overview);
  for (const item of runs) {
    font(9);
    const cells = overview.map((column) => wrap(column.value(item), column.width - 3));
    const height = Math.max(...cells.map((lines) => lines.length)) * lineH(9) + 3;
    if (ensure(height)) tableHeader(overview);
    let x = margin;
    cells.forEach((lines, index) => {
      const color = index === 3 ? REGRESSION_COLOR[item.run.regression.toLowerCase()] ?? TEXT : TEXT;
      font(9, index === 0 || index === 3 ? 'bold' : 'normal', color);
      doc.text(lines, x + 2, y + 1.5 + lineH(9) * 0.75);
      x += overview[index].width;
    });
    y += height;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
  }
  if (hasCredits) {
    const breakdown = runs.flatMap((item) => (item.run.credits
      ? [`${item.model}: ${creditsBreakdown(item.run.credits)}`]
      : []));
    y += 2;
    paragraph(
      `Credits: Copilot Studio's estimate of the Copilot Credits used to answer and score the test cases (${breakdown.join('; ')}).`,
      8, margin, contentW, 'italic', MUTED,
    );
  }

  // AI summary
  const bullet = (text: string) => {
    font(9.5);
    const lines = wrap(text, contentW - 6);
    ensure(lineH(9.5));
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.circle(margin + 1.8, y + lineH(9.5) * 0.5, 0.8, 'F');
    for (const line of lines) {
      ensure(lineH(9.5));
      font(9.5);
      doc.text(line, margin + 5, y + lineH(9.5) * 0.75);
      y += lineH(9.5);
    }
    y += 0.8;
  };
  // jsPDF's built-in fonts cannot draw emoji, so section icons are left out.
  const sectionsBlock = (sections: AnalysisSection[]) => {
    for (const section of sections) {
      y += 1.5;
      if (section.heading) {
        ensure(lineH(9) + lineH(9.5));
        paragraph(section.heading, 9, margin, contentW, 'bold', MUTED);
      }
      section.items.forEach(bullet);
    }
  };
  const kitBlock = (run: EvaluationRunVM) => {
    const kit = run.kit;
    if (!kit) return;
    y += 3;
    ensure(14);
    font(10, 'bold', BRAND);
    doc.text('Copilot Agent Kit tests', margin, y + 4);
    y += 6;
    const counts = kit.total > 0
      ? `${kit.status}  |  ${kit.pass} of ${kit.total} passed, ${kit.fail} failed, ${kit.regressed} regressed, ${kit.improved} improved`
      : kit.status;
    paragraph(counts, 9, margin, contentW, 'normal', MUTED);
    const summary = kit.summary?.trim();
    // The Kit flow may write the same text as the AI summary; don't repeat it.
    if (summary && summary !== run.ai?.trim()) {
      y += 1;
      const sections = presentAnalysis(summary, []).sections;
      if (sections) sectionsBlock(sections);
      else paragraph(summary, 9.5);
    } else if (!summary && kit.message) {
      paragraph(kit.message, 9.5, margin, contentW, 'italic', MUTED);
    }
  };
  heading('AI Summary');
  const recommendation = data.recommendation;
  if (recommendation) {
    ensure(24);
    font(11, 'bold', BRAND);
    doc.text('Model recommendation', margin, y + 4);
    y += 7;
    const verdict = [recommendation.winner, recommendation.verdictLabel, recommendation.confidenceLabel]
      .filter(Boolean)
      .join('  |  ');
    paragraph(verdict, 10, margin, contentW, 'bold', TEXT);
    paragraph(recommendation.headline, 9.5, margin, contentW, 'bold');
    y += 0.5;
    paragraph(recommendation.evidence, 8.5, margin, contentW, 'normal', MUTED);
    y += 1;
    recommendation.reasons.forEach(bullet);
    const list = (title: string, items: string[]) => {
      if (items.length === 0) return;
      y += 1.5;
      ensure(lineH(9) + lineH(9.5));
      paragraph(title, 9, margin, contentW, 'bold', MUTED);
      items.forEach(bullet);
    };
    list('Trade-offs', recommendation.tradeoffs);
    list('Keep in mind', recommendation.caveats);
    y += 1;
    paragraph('AI-generated from both runs\' results. Check the results before you change models.', 8, margin, contentW, 'italic', MUTED);
    y += 7;
  }
  runs.forEach((item, index) => {
    if (index > 0) y += 7;
    ensure(18);
    font(11, 'bold', TEXT);
    doc.text(pdfText(item.model), margin, y + 4);
    const modelW = doc.getTextWidth(pdfText(item.model));
    font(9, 'normal', MUTED);
    doc.text(pdfText(`${formatWhen(item.run.completedOn ?? item.run.startedOn)}  |  ${item.run.pass} passed, ${item.run.fail} failed, ${item.run.error} errors`), margin + modelW + 4, y + 4);
    y += 7;

    const text = item.run.ai?.trim();
    if (!text) {
      paragraph(`Analysis ${item.run.analysisStatus.toLowerCase() || 'not available'}.`, 9.5, margin, contentW, 'italic', MUTED);
      kitBlock(item.run);
      return;
    }
    const runResults = (data.results ?? []).filter((result) => result.runId?.toLowerCase() === item.run.id.toLowerCase());
    const analysis = presentAnalysis(text, runResults);
    if (analysis.sections) {
      sectionsBlock(analysis.sections);
      kitBlock(item.run);
      return;
    }
    if (analysis.summary) paragraph(analysis.summary, 10, margin, contentW, 'bold');
    if (analysis.findings.length > 0) {
      y += 1.5;
      paragraph('Key findings', 9, margin, contentW, 'bold', MUTED);
      analysis.findings.forEach(bullet);
    }
    if (analysis.nextStep) {
      font(9.5);
      const lines = wrap(analysis.nextStep, contentW - 8);
      const height = lines.length * lineH(9.5) + 9;
      ensure(height);
      y += 1.5;
      doc.setFillColor(240, 242, 253);
      doc.rect(margin, y, contentW, height, 'F');
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.rect(margin, y, 1.2, height, 'F');
      font(8.5, 'bold', BRAND);
      doc.text('Recommended next step', margin + 4, y + 4.5);
      font(9.5);
      doc.text(lines, margin + 4, y + 6 + lineH(9.5) * 0.75);
      y += height + 1;
    }
    kitBlock(item.run);
  });

  // Test results, grouped by test set, then test case
  heading('Test results');
  if (data.rows.length === 0) {
    paragraph('No test results for the selected runs.', 9.5, margin, contentW, 'italic', MUTED);
  }
  const caseW = 64;
  const metricW = 36;
  const runW = (contentW - caseW - metricW) / Math.max(runs.length, 1);
  const resultHeader = () => tableHeader([
    { title: 'Test case', width: caseW },
    { title: 'Metric', width: metricW },
    ...runs.map((item) => ({ title: item.model, width: runW })),
  ]);
  const sets = new Map<string, ComparisonExportRow[]>();
  for (const row of data.rows) {
    const key = row.testSet?.trim() || 'Test cases';
    sets.set(key, [...(sets.get(key) ?? []), row]);
  }
  const layoutCase = (caseRows: ComparisonExportRow[]) => {
    font(8.5);
    const question = wrap(questionsCell(caseRows[0].questions) || '(No question text)', caseW - 4);
    const rowLayouts = caseRows.map((row) => {
      font(8.5);
      const metric = wrap(metricDisplayName(row.metric, row.grader), metricW - 4);
      font(7.5);
      const findings = row.cells.map((cell) => (cell.finding ? wrap(cell.finding, runW - 4) : []));
      const cellH = Math.max(...findings.map((lines) => lines.length), 0) * lineH(7.5);
      return { row, metric, findings, height: Math.max(metric.length * lineH(8.5), 5 + cellH) + 3 };
    });
    const caseH = Math.max(question.length * lineH(8.5) + 3, rowLayouts.reduce((sum, layout) => sum + layout.height, 0));
    return { question, rowLayouts, caseH: Math.min(caseH, bottom - margin - 10) };
  };
  for (const [setName, setRows] of sets) {
    const cases = new Map<string, ComparisonExportRow[]>();
    for (const row of setRows) {
      const key = row.caseKey ?? questionsCell(row.questions);
      cases.set(key, [...(cases.get(key) ?? []), row]);
    }
    const layouts = Array.from(cases.values(), layoutCase);
    // Keep the set title and column header on the same page as its first case.
    ensure(7 + 6.5 + 7 + (layouts[0]?.caseH ?? 0));
    y += 7;
    font(10.5, 'bold', TEXT);
    doc.text(pdfText(setName), margin, y + 4, { maxWidth: contentW });
    y += 6.5;
    resultHeader();
    for (const { question, rowLayouts, caseH } of layouts) {
      if (ensure(caseH)) resultHeader();
      font(8.5, 'normal', TEXT);
      doc.text(question, margin + 2, y + 1.5 + lineH(8.5) * 0.75);
      const questionBottom = y + question.length * lineH(8.5) + 3;
      let samePage = true;
      let rowY = y;
      rowLayouts.forEach((layout, index) => {
        if (rowY + layout.height > bottom) {
          doc.addPage();
          y = margin;
          resultHeader();
          rowY = y;
          samePage = false;
        }
        if (index > 0) {
          doc.setDrawColor(235, 235, 235);
          doc.setLineWidth(0.15);
          doc.line(margin + caseW, rowY, pageW - margin, rowY);
        }
        font(8.5);
        doc.text(layout.metric, margin + caseW + 2, rowY + 1.5 + lineH(8.5) * 0.75);
        layout.row.cells.forEach((cell, cellIndex) => {
          const x = margin + caseW + metricW + cellIndex * runW;
          if (cell.text !== undefined) {
            font(8.5, 'normal', TEXT);
            doc.text(pdfText(cell.text), x + 2, rowY + 1.5 + lineH(8.5) * 0.75);
            return;
          }
          const status = cell.status ?? 'Not run';
          const style = STATUS_STYLE[status.toLowerCase()];
          font(8, 'bold', style?.text ?? MUTED);
          const badgeW = doc.getTextWidth(status) + 4;
          if (style) {
            doc.setFillColor(style.fill[0], style.fill[1], style.fill[2]);
            doc.roundedRect(x + 2, rowY + 1.2, badgeW, 4.2, 1, 1, 'F');
          }
          doc.text(pdfText(status), x + 4, rowY + 4.2);
          if (layout.findings[cellIndex].length > 0) {
            font(7.5, 'normal', MUTED);
            doc.text(layout.findings[cellIndex], x + 2, rowY + 6.5 + lineH(7.5) * 0.75);
          }
        });
        rowY += layout.height;
      });
      y = samePage ? Math.max(rowY, questionBottom) : rowY;
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.setLineWidth(0.25);
      doc.line(margin, y, pageW - margin, y);
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font(8, 'normal', MUTED);
    doc.text(pdfText(`Model Assessment  |  ${agent}`), margin, pageH - 8);
    doc.text(`Page ${page} of ${pages}`, pageW - margin, pageH - 8, { align: 'right' });
  }
  return doc;
}

const safeName = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

/** Build and download the comparison as a PDF report. */
export async function exportComparison(data: ComparisonExport): Promise<void> {
  const blob = buildComparisonPdf(data).output('blob');
  const stamp = new Date().toISOString().slice(0, 10);
  const name = safeName(data.agentName ?? '') || 'Agent';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ModelAssessment_${name}_${stamp}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}