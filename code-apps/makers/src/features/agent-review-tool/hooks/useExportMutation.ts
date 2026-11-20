/**
 * useExportMutation Hook
 *
 * React Query mutation for exporting reviewed agents to Excel.
 * Fetches full stage output (patterns + compliance) for each review
 * in parallel before building the workbook.
 */

import { useMutation } from '@tanstack/react-query';
import { reviewService } from '../services/ReviewService';
import { generateExcelExport } from '../utils/excelExportUtils';
import { downloadExcel } from '../utils/exportUtils';
import type { ReviewResult } from '../contracts/ReviewResult';

export interface ExportResult {
  /** Number of reviews exported */
  reviewCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Filename */
  filename: string;
}

/**
 * useExportMutation Hook
 *
 * Generates and downloads Excel file with all reviewed agent data.
 * Fetches full pattern/compliance detail from Dataverse in parallel
 * before building the workbook.
 *
 * @returns Mutation object — call mutateAsync(reviews)
 */
export function useExportMutation() {
  return useMutation<ExportResult, Error, ReviewResult[]>({
    mutationFn: async (reviews) => {
      if (reviews.length === 0) {
        throw new Error('No reviewed agents available to export');
      }

      // Deduplicate — keep most recent per botId
      const reviewMap = new Map<string, ReviewResult>();
      for (const r of reviews) {
        if (!reviewMap.has(r.botId)) reviewMap.set(r.botId, r);
      }
      const uniqueReviews = Array.from(reviewMap.values());

      // Fetch full stage details (patterns + compliance) in parallel
      const enriched = await Promise.all(
        uniqueReviews.map(async (review) => {
          if (!review.reviewId || !review.hasReviewData) return review;
          try {
            const details = await reviewService.getReviewDetails(review.reviewId);
            return { ...review, ...details };
          } catch {
            // Non-fatal — export summary row without detail
            return review;
          }
        })
      );

      const excelBlob = await generateExcelExport(enriched);
      const filename = `AgentReviews_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      downloadExcel(excelBlob, filename);

      return {
        reviewCount: enriched.length,
        fileSize: excelBlob.size,
        filename,
      };
    },
  });
}
