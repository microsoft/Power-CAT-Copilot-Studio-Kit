import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewResult } from '../../contracts/ReviewResult';

const { getReviewHistory, getReviewDetails } = vi.hoisted(() => ({
  getReviewHistory: vi.fn(),
  getReviewDetails: vi.fn(),
}));
vi.mock('../../services/ReviewService', () => ({
  reviewService: { getReviewHistory, getReviewDetails },
}));

import { loadOriginalStageA, ORIGINAL_REVIEW_SEARCH_LIMIT } from '../services/upgradeOriginalReview';

const STAGE_A = { botId: 'original-1', botName: 'Expense helper', agentInstructions: 'Saved text.' };

function historyRow(
  reviewId: string,
  reviewKind: ReviewResult['reviewKind'],
  reviewedOn: Date,
  sourceEnvironment = 'source-env-1',
): ReviewResult {
  return {
    reviewId,
    botId: 'original-1',
    componentIdUnique: 'original-1-component',
    botName: 'Expense helper',
    overallScore: 0,
    patternScore: 0,
    instructionScore: 0,
    highSeverityCount: 0,
    mediumSeverityCount: 0,
    lowSeverityCount: 0,
    totalIssueCount: 0,
    reviewedOn,
    durationMs: 0,
    status: 'completed',
    sourceEnvironment,
    ...(reviewKind === undefined ? {} : { reviewKind }),
  };
}

beforeEach(() => {
  getReviewHistory.mockReset();
  getReviewDetails.mockReset();
});

describe('loadOriginalStageA', () => {
  it('uses the newest standard review of the same environment', async () => {
    getReviewHistory.mockResolvedValue([
      historyRow('copilot-1', 'copilot', new Date(2026, 0, 20, 12)),
      historyRow('legacy-1', undefined, new Date(2026, 0, 19, 12)),
      historyRow('standard-1', 'standard', new Date(2026, 0, 15, 12)),
      historyRow('standard-0', 'standard', new Date(2026, 0, 10, 12)),
    ]);
    getReviewDetails.mockResolvedValue({
      stageAOutput: JSON.stringify(STAGE_A),
      agentInstructions: 'Help users.',
      reviewedOn: new Date(2026, 0, 15, 13),
    });

    await expect(loadOriginalStageA('original-1', 'source-env-1')).resolves.toStrictEqual({
      status: 'found',
      stageA: { ...STAGE_A, agentInstructions: 'Help users.' },
      reviewId: 'standard-1',
      reviewedOn: new Date(2026, 0, 15, 13),
    });
    expect(getReviewHistory).toHaveBeenCalledWith({ botId: 'original-1', sourceEnvironment: 'source-env-1' });
    expect(getReviewDetails).toHaveBeenCalledTimes(1);
    expect(getReviewDetails).toHaveBeenCalledWith('standard-1');
  });

  it('skips the rows of other environments and keeps the Stage A instructions', async () => {
    getReviewHistory.mockResolvedValue([
      historyRow('other-environment', 'standard', new Date(2026, 1, 3, 12), 'source-env-2'),
      historyRow('no-environment', 'standard', new Date(2026, 0, 15, 12), ''),
    ]);
    getReviewDetails.mockResolvedValue({ stageAOutput: JSON.stringify(STAGE_A) });

    await expect(loadOriginalStageA('original-1', '')).resolves.toStrictEqual({
      status: 'found',
      stageA: STAGE_A,
      reviewId: 'no-environment',
      reviewedOn: new Date(2026, 0, 15, 12),
    });
    expect(getReviewDetails).toHaveBeenCalledTimes(1);
    expect(getReviewDetails).toHaveBeenCalledWith('no-environment');
  });

  it('skips a review whose Stage A is not JSON or is not a JSON object', async () => {
    getReviewHistory.mockResolvedValue([
      historyRow('broken', 'standard', new Date(2026, 0, 20, 12)),
      historyRow('array', 'standard', new Date(2026, 0, 19, 12)),
      historyRow('valid', 'standard', new Date(2026, 0, 15, 12)),
    ]);
    const details: Record<string, { stageAOutput: string }> = {
      broken: { stageAOutput: '{not json' },
      array: { stageAOutput: '[]' },
      valid: { stageAOutput: JSON.stringify(STAGE_A) },
    };
    getReviewDetails.mockImplementation((reviewId: string) => Promise.resolve(details[reviewId]));

    await expect(loadOriginalStageA('original-1', 'source-env-1')).resolves.toMatchObject({
      status: 'found',
      reviewId: 'valid',
    });
    expect(getReviewDetails).toHaveBeenCalledTimes(3);
  });

  it(`opens at most ${ORIGINAL_REVIEW_SEARCH_LIMIT} saved reviews`, async () => {
    getReviewHistory.mockResolvedValue(Array.from(
      { length: ORIGINAL_REVIEW_SEARCH_LIMIT + 1 },
      (_, index) => historyRow(`standard-${index}`, 'standard', new Date(2026, 0, 20 - index, 12)),
    ));
    getReviewDetails.mockResolvedValue({});

    await expect(loadOriginalStageA('original-1', 'source-env-1')).resolves.toStrictEqual({ status: 'not-reviewed' });
    expect(getReviewDetails).toHaveBeenCalledTimes(ORIGINAL_REVIEW_SEARCH_LIMIT);
  });

  it('reports no saved standard review and reads no details when no row is a standard review', async () => {
    getReviewHistory.mockResolvedValue([
      historyRow('copilot-1', 'copilot', new Date(2026, 0, 20, 12)),
      historyRow('', 'standard', new Date(2026, 0, 19, 12)),
    ]);

    await expect(loadOriginalStageA('original-1', 'source-env-1')).resolves.toStrictEqual({ status: 'not-reviewed' });
    expect(getReviewDetails).not.toHaveBeenCalled();
  });

  it('gives a read error to the caller', async () => {
    getReviewHistory.mockRejectedValue(new Error('Unable to load review history.'));

    await expect(loadOriginalStageA('original-1', 'source-env-1')).rejects.toThrow('Unable to load review history.');
    expect(getReviewDetails).not.toHaveBeenCalled();
  });
});
