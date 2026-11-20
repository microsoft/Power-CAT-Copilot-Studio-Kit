import { describe, expect, it } from 'vitest';
import { ReviewJobError } from '../../agents-experience/contracts/ReviewJob';
import { classifyAIError, classifyStandardReviewError } from '../aiErrorClassifier';
import { UNSUPPORTED_HARNESS_MESSAGE, UnsupportedHarnessError } from '../../agents-experience/services/detection';

describe('standard review error classification', () => {
  it('does not offer a duplicate retry while a timed-out server job can still finish', () => {
    const message =
      'The review workflow has run for 45 minutes without finishing. The server job was not cancelled.';

    expect(classifyStandardReviewError(
      new ReviewJobError('timeout', message),
    )).toMatchObject({
      title: 'Review is still running',
      message,
      canRetry: false,
    });
  });

  it('still permits a retry when a recovered job was never queued', () => {
    expect(classifyStandardReviewError(
      new ReviewJobError('workflow-unavailable', 'The review job was not queued.'),
    ).canRetry).toBe(true);
  });
});

describe('unsupported harness error classification', () => {
  it('shows the exact message and offers no retry', () => {
    for (const classify of [classifyAIError, classifyStandardReviewError]) {
      const classified = classify(new UnsupportedHarnessError());
      expect(classified).toMatchObject({
        title: 'Harness not supported',
        message: UNSUPPORTED_HARNESS_MESSAGE,
        canRetry: false,
      });
      expect(classified.technicalDetail).toBeUndefined();
    }
  });
});
