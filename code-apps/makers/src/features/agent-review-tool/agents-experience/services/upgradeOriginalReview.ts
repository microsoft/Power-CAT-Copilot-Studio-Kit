import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import { reviewService } from '../../services/ReviewService';

/** The loader opens at most this number of saved standard reviews. */
export const ORIGINAL_REVIEW_SEARCH_LIMIT = 3;

/** The Stage A snapshot of the newest usable saved standard review of the original agent. */
export type OriginalStageAResult =
  | { status: 'not-reviewed' }
  | { status: 'found'; stageA: LocalStageAOutput; reviewId: string; reviewedOn: Date };

function parseStageA(text?: string): LocalStageAOutput | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as LocalStageAOutput
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the Stage A snapshot of the newest saved standard review of an agent in 1 environment.
 * This function reads only. It opens at most ORIGINAL_REVIEW_SEARCH_LIMIT review details.
 * It skips Copilot reviews, legacy rows with no review kind, and rows of other environments.
 * A read error goes to the caller.
 */
export async function loadOriginalStageA(botId: string, sourceEnvironment: string): Promise<OriginalStageAResult> {
  const history = await reviewService.getReviewHistory({ botId, sourceEnvironment });
  let opened = 0;
  for (const entry of history) {
    if (entry.reviewKind !== 'standard' || !entry.reviewId) continue;
    if ((entry.sourceEnvironment ?? '') !== sourceEnvironment) continue;
    if (opened >= ORIGINAL_REVIEW_SEARCH_LIMIT) break;
    opened += 1;
    const details = await reviewService.getReviewDetails(entry.reviewId);
    const stageA = parseStageA(details.stageAOutput);
    if (!stageA) continue;
    return {
      status: 'found',
      stageA: { ...stageA, agentInstructions: details.agentInstructions || stageA.agentInstructions || '' },
      reviewId: entry.reviewId,
      reviewedOn: details.reviewedOn ?? entry.reviewedOn,
    };
  }
  return { status: 'not-reviewed' };
}
