import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { renderDAPdfReport } from './daPdfReport';

/**
 * Choose the existing package-card color. Legacy health checks determine it
 * only when an older review has no package validation.
 */
export function packageValidityCardColor(
  packageStatus: NonNullable<DAReviewRecord['packageValidation']>['status'] | undefined,
  legacyFailCount: number,
): string {
  if (packageStatus) {
    return packageStatus === 'invalid' ? '#c50f1f'
      : packageStatus === 'valid-with-warnings' ? '#b7580a' : '#107c10';
  }
  return legacyFailCount > 0 ? '#c50f1f' : '#107c10';
}

/** Generate a local PDF with the Standard layout and the saved M365 review projection. */
export async function generateDAPdfReport(review: DAReviewRecord): Promise<Blob> {
  return renderDAPdfReport(review);
}
