/**
 * useDAExportMutation Hook
 *
 * Mutation hook wrapping PDF and Excel export for DA reviews.
 * Handles download trigger via blob URL.
 */

import { useMutation } from '@tanstack/react-query';
import { generateDAPdfReport } from '../utils/daPdfUtils';
import { buildDAExcelWorkbook } from '../utils/daExportUtils';
import { getDAReviewById } from '../services/DAReviewService';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildDateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface UseDAExportMutationResult {
  downloadPdf: (review: DAReviewRecord) => Promise<void>;
  exportExcel: (reviews: DAReviewRecord[]) => Promise<void>;
  isPdfPending: boolean;
  isExcelPending: boolean;
  pdfError: Error | null;
  excelError: Error | null;
}

export function useDAExportMutation(): UseDAExportMutationResult {
  const pdfMutation = useMutation({
    mutationFn: async (review: DAReviewRecord) => {
      const blob = await generateDAPdfReport(review);
      const safeName = review.agentName.replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadBlob(blob, `${safeName}_da_review_${buildDateSuffix()}.pdf`);
    },
  });

  const excelMutation = useMutation({
    mutationFn: async (reviews: DAReviewRecord[]) => {
      // Fetch full evaluation data in parallel — list query omits cat_reviewresultjson
      const enriched = await Promise.all(
        reviews.map(async (r) => {
          if (!r.reviewId) return r;
          try {
            const full = await getDAReviewById(r.reviewId);
            return full ?? r;
          } catch {
            return r;
          }
        })
      );
      const blob = await buildDAExcelWorkbook(enriched);
      downloadBlob(blob, `DAReviews_Export_${buildDateSuffix()}.xlsx`);
    },
  });

  return {
    downloadPdf: (review: DAReviewRecord) => pdfMutation.mutateAsync(review),
    exportExcel: (reviews: DAReviewRecord[]) => excelMutation.mutateAsync(reviews),
    isPdfPending: pdfMutation.isPending,
    isExcelPending: excelMutation.isPending,
    pdfError: pdfMutation.error as Error | null,
    excelError: excelMutation.error as Error | null,
  };
}
