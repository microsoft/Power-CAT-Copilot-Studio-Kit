/**
 * Export Utilities
 *
 * Handles export functionality for review results in multiple formats:
 * - SARIF v2.1.0 (DevOps integration)
 * - PDF (locally generated report)
 * - Excel (multi-sheet workbook)
 *
 * Based on pcf-extracted-logic.md Section 8
 */

import type { SarifLog } from './sarifReport';
export { generateSARIF } from './sarifReport';

/**
 * Download PDF file
 *
 * Triggers browser download with proper filename.
 *
 * @param pdfBlob - PDF file as Blob
 * @param botName - Bot name for filename
 */
export function downloadPdf(pdfBlob: Blob, botName: string): void {
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(botName)}_review_${getDateString()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download SARIF file
 *
 * Converts SARIF object to JSON and triggers browser download.
 *
 * @param sarif - SARIF log object
 * @param botName - Bot name for filename
 */
export function downloadSarif(sarif: SarifLog, botName: string): void {
  const json = JSON.stringify(sarif, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(botName)}_review.sarif`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download Excel file
 *
 * Triggers browser download with proper filename.
 *
 * @param excelBlob - Excel file as Blob
 * @param filename - Custom filename (optional)
 */
export function downloadExcel(excelBlob: Blob, filename?: string): void {
  const url = URL.createObjectURL(excelBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `AgentReviews_Export_${getDateString()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename to remove invalid characters
 *
 * @param filename - Original filename
 * @returns Sanitized filename
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get current date as YYYY-MM-DD string
 *
 * @returns Date string
 */
function getDateString(): string {
  return new Date().toISOString().split('T')[0];
}
