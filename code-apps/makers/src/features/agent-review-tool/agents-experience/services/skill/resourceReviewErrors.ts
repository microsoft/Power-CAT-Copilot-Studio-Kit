import type { BoundedMapResult } from './concurrency';
import { redactSecrets } from './resourceScanners';

/** Retain bounded evaluator error details with credentials removed before display. */
export function resourceReviewError(reason: unknown): string {
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === 'string'
      ? reason
      : reason !== null && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string'
        ? reason.message
        : 'The file check failed without a readable error message.';
  return redactSecrets(message).slice(0, 1600);
}

/** Collect rejected or cancelled checks without exposing raw error objects. */
export function resourceReviewErrors(
  outcomes: readonly BoundedMapResult<unknown>[],
): string | undefined {
  const errors = outcomes.flatMap((outcome, index) => {
    if (outcome.status === 'rejected') {
      return [`Check ${index + 1}: ${resourceReviewError(outcome.reason)}`];
    }
    return outcome.status === 'cancelled'
      ? [`Check ${index + 1}: cancelled before it started.`] : [];
  });
  return errors.length > 0 ? resourceReviewError(errors.join('\n')) : undefined;
}
