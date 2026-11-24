/**
 * Health classifier for an agent.
 *
 * Real branches:
 *   - `unknown` (Not Analyzed): no analyzer rows exist for the agent in the
 *     active time period.
 *   - `healthy`: at least one analyzer row exists; sentiment/PII parsing is
 *     stubbed (treated as healthy when no signals can be derived).
 *
 * Stubbed branches (to be filled once cat_promptresult parsing is wired -
 * see data-model.md Open Question 1):
 *   - `attention`: sentiment.negative > threshold OR pii in {low, medium}
 *   - `critical`: pii === 'high' OR sentiment.negative > stricter threshold
 *   - `analyzing`: analyzer row exists but cat_promptresult is empty/missing
 *
 * The signature accepts the per-agent rollup so the caller decides which
 * inputs to compute (counts of rows by sentiment / pii) without this util
 * touching the table.
 */

import type { HealthStatus, SentimentLabel, PiiExposure } from '../contracts/types';

export interface AgentRollup {
  /** Total analyzer rows for the agent in the active period. */
  analyzerRowCount: number;
  /** Sentiment distribution across the agent's rows (placeholder zeros until parser ships). */
  sentiment?: Record<SentimentLabel, number>;
  /** PII distribution across the agent's rows (placeholder zeros until parser ships). */
  pii?: Record<PiiExposure, number>;
  /** Rows where cat_promptresult is missing/empty (i.e., still running). */
  pendingResultCount?: number;
}

export function classifyHealth(rollup: AgentRollup): HealthStatus {
  if (rollup.analyzerRowCount === 0) return 'unknown';

  if (rollup.pendingResultCount && rollup.pendingResultCount === rollup.analyzerRowCount) {
    return 'unknown';
  }

  const pii = rollup.pii;
  if (pii && pii.high > 0) return 'critical';

  const sentiment = rollup.sentiment;
  if (sentiment && sentiment.negative > 0) return 'attention';

  if (pii && (pii.medium > 0 || pii.low > 0)) return 'attention';

  return 'healthy';
}
