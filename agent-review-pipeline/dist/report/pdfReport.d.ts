/**
 * pdfReport.ts
 *
 * PDF report generation for pipeline agent reviews using jsPDF.
 * Ported from Agent Review Tool's csPdfUtils.ts.
 */
import type { EvaluationResult } from '../evaluation/evaluationOrchestrator.js';
/**
 * Generate a PDF report for one or more evaluated agents.
 *
 * @param results - Array of evaluation results (one per agent)
 * @returns PDF as Buffer
 */
export declare function generatePdfReport(results: EvaluationResult[]): Buffer;
