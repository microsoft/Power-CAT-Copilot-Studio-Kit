/**
 * PDF and SARIF export for the Standard review page.
 *
 * Duplicated from `Dashboard` rather than moved. `Dashboard` keeps its own
 * copies, which `ReviewDialogV2` uses.
 */

import { useCallback, useState } from 'react';
import { Toast, ToastTitle, useToastController } from '@fluentui/react-components';
import { generateSARIF, downloadSarif, downloadPdf } from '../utils/exportUtils';
import { generateCsPdfReport } from '../utils/csPdfUtils';
import type { ReviewResult } from '../contracts/ReviewResult';

export interface UseStandardReviewExportsResult {
  downloadPdfReport: () => Promise<void>;
  downloadPublicPdfReport: () => Promise<void>;
  downloadSarifReport: () => void;
  isPdfDownloading: boolean;
  isSarifDownloading: boolean;
  /** True while either export runs — both buttons disable together. */
  isExporting: boolean;
}

/** Export the same saved standard review from each review surface. */
export function useStandardReviewExports(
  review: ReviewResult,
  toasterId: string,
): UseStandardReviewExportsResult {
  const { dispatchToast } = useToastController(toasterId);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [isSarifDownloading, setIsSarifDownloading] = useState(false);

  const exportPdfReport = useCallback(async (publicSafe: boolean) => {
    setIsPdfDownloading(true);
    try {
      const pdfBlob = await generateCsPdfReport(review, { redactSensitiveValues: publicSafe });
      downloadPdf(pdfBlob, publicSafe ? 'Public_Agent_Review' : review.botName);
      dispatchToast(
        <Toast><ToastTitle>PDF downloaded successfully!</ToastTitle></Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      // A review saved before the stage outputs were persisted cannot produce a
      // PDF at all, which needs a different instruction from a transient error.
      const isMissingData = err instanceof Error && err.message === 'MISSING_STAGE_OUTPUTS';
      dispatchToast(
        <Toast>
          <ToastTitle>
            {isMissingData
              ? 'Review data unavailable. Please re-run the review to generate a PDF.'
              : 'Failed to generate PDF report. Please try again.'}
          </ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setIsPdfDownloading(false);
    }
  }, [review, dispatchToast]);

  const downloadPdfReport = useCallback(() => exportPdfReport(false), [exportPdfReport]);
  const downloadPublicPdfReport = useCallback(() => exportPdfReport(true), [exportPdfReport]);

  const downloadSarifReport = useCallback(() => {
    setIsSarifDownloading(true);
    try {
      const sarif = generateSARIF(review);
      downloadSarif(sarif, review.botName);
      dispatchToast(
        <Toast><ToastTitle>SARIF file downloaded successfully!</ToastTitle></Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      console.error('Failed to generate SARIF:', err);
      dispatchToast(
        <Toast><ToastTitle>Failed to generate SARIF file. Please try again.</ToastTitle></Toast>,
        { intent: 'error' },
      );
    } finally {
      setIsSarifDownloading(false);
    }
  }, [review, dispatchToast]);

  return {
    downloadPdfReport,
    downloadPublicPdfReport,
    downloadSarifReport,
    isPdfDownloading,
    isSarifDownloading,
    isExporting: isPdfDownloading || isSarifDownloading,
  };
}
