/**
 * The view model behind the runtime metric cards.
 *
 * Split from `RuntimeMetrics.tsx` for the same reason `score.ts` is split from `ScoreCard.tsx`:
 * the test environment is `node`, so anything importing Fluent UI cannot be unit tested, and the
 * decision this file makes is the part worth testing.
 *
 * Named `runtimeSummary` rather than `runtimeMetrics` because a name differing from
 * `RuntimeMetrics.tsx` only in casing is the same path on Windows, and
 * `forceConsistentCasingInFileNames` rejects the resulting collision.
 */

import { formatDuration, pluralize } from './format';

/** The subset of a runtime report these cards need. Every percentage is 0-100, never a fraction. */
export interface RuntimeMetricsSummary {
  /** Conversations folded in — not transcript rows. */
  transcriptsAnalyzed: number;
  /** Rows behind those conversations. Shown alongside because the two diverge badly. */
  transcriptRowsAnalyzed: number;
  conversationsWithErrors: number;
  /** Share of analysed conversations hitting at least one error, 0-100. */
  errorRatePercent: number;
  uniqueErrorTypes: number;
  totalErrors: number;
  totalToolCalls: number;
  /** Mean step duration in milliseconds. Only meaningful when `totalSteps` is above zero. */
  avgStepMs: number;
  /** Plan steps the transcripts actually recorded. Zero is normal — see `timingCard`. */
  totalSteps: number;
  /** Mean tool-call duration in milliseconds, used when no plan steps were recorded. */
  avgToolMs?: number;
  totalKnowledgeSearches: number;
  /** Knowledge is attached to the agent but no transcript ever searched it. */
  knowledgeConfiguredButUnused?: boolean;
}

/** The timing tile, which is the only card whose label depends on the data. */
export interface TimingCard {
  label: string;
  value: string;
  detail?: string;
}

/**
 * Choose what the timing card can honestly say.
 *
 * Plan-step timing only exists in transcripts that emit `DynamicPlanStepFinished`. Newer agents
 * record their work as tool-call traces instead, so reading `avgStepMs` unconditionally reports
 * "0 ms" — which a reader takes to mean "this agent is instant" rather than "this was never
 * measured". Falling back to tool timings reports a real number; saying nothing was recorded is
 * better than either when there is no timing at all.
 */
export function timingCard(summary: RuntimeMetricsSummary | undefined): TimingCard {
  if (!summary) return { label: 'Average step time', value: formatDuration(0) };
  if (summary.totalSteps > 0) {
    return {
      label: 'Average step time',
      value: formatDuration(summary.avgStepMs),
      detail: pluralize(summary.totalSteps, 'step'),
    };
  }
  if (summary.avgToolMs !== undefined && summary.avgToolMs > 0 && summary.totalToolCalls > 0) {
    return {
      label: 'Average tool time',
      value: formatDuration(summary.avgToolMs),
      detail: pluralize(summary.totalToolCalls, 'tool call'),
    };
  }
  return { label: 'Average step time', value: '—', detail: 'Not recorded in these transcripts' };
}
