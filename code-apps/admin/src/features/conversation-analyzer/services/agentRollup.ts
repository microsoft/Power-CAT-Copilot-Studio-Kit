/**
 * Per-agent rollup for the Agents grid and the Overview agent summary.
 *
 * Period-scoped: status, sentiment, PII risk, conversations and analyzer-record share.
 * All-time: last analyzed.
 */

import { classifyHealth } from '../utils/healthClassifier';
import { rowMatchesAgent } from '../utils/rowMatchesAgent';
import type { HealthStatus, PiiExposure, SentimentLabel } from '../contracts/types';
import { groupRowsByAgentId, rowsInPeriod, type AnalyzerBase, type AnalyzerBaseRow } from './analyzerBase';

export interface AgentTableRow {
  agentDetailsId: string;
  agentId?: string;
  name: string;
  environmentName?: string;
  environmentUrl?: string;
  /** Analyzer records in the active period, including repeated analyses. */
  conversations: number;
  /** Agent analyzer records ÷ all analyzer records in the period (0–1). */
  coverageRatio: number;
  sentiment: SentimentLabel;
  pii: PiiExposure;
  lastAnalyzedAt?: string;
  /** True when the agent has any analyzer row (all time). */
  hasResults: boolean;
  status: HealthStatus;
}

function matchedRows(
  byAgent: Map<string, AnalyzerBaseRow[]>,
  agentId: string,
  envUrl: string | undefined,
): AnalyzerBaseRow[] {
  return (byAgent.get(agentId) ?? []).filter((r) =>
    rowMatchesAgent(r.agentId, r.environmentUrl, agentId, envUrl),
  );
}

function deriveSentiment(dist: Record<SentimentLabel, number>): SentimentLabel {
  const { positive, negative, mixed, neutral } = dist;
  if (positive + negative + mixed + neutral === 0) return 'unknown';
  if (mixed > 0 || (positive > 0 && negative > 0)) {
    if (negative > positive + mixed) return 'negative';
    if (positive > negative + mixed) return 'positive';
    return 'mixed';
  }
  if (negative > 0) return 'negative';
  if (positive > 0) return 'positive';
  return 'neutral';
}

function derivePii(dist: Record<PiiExposure, number>): PiiExposure {
  if (dist.high > 0) return 'high';
  if (dist.medium > 0) return 'medium';
  if (dist.low > 0) return 'low';
  if (dist.none > 0) return 'none';
  return 'unknown';
}

/** Builds one grid row per agent using its share of analyzer records in the period. */
export function buildAgentRows(
  base: AnalyzerBase,
  from: string,
  to: string,
): AgentTableRow[] {
  const allByAgent = groupRowsByAgentId(base.rows);
  const rows = rowsInPeriod(base.rows, from, to);
  const periodByAgent = groupRowsByAgentId(rows);
  const totalRows = rows.length;

  return base.agents.map((a) => {
    const agentId = a.agentId ?? '';
    const allRows = matchedRows(allByAgent, agentId, a.environmentUrl);
    const periodRows = matchedRows(periodByAgent, agentId, a.environmentUrl);

    const sentiment: Record<SentimentLabel, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0, unknown: 0 };
    const pii: Record<PiiExposure, number> = { none: 0, low: 0, medium: 0, high: 0, unknown: 0 };
    let pending = 0;
    for (const r of periodRows) {
      if (r.pending) pending++;
      if (r.parsed?.sentiment) sentiment[r.parsed.sentiment]++;
      if (r.parsed?.pii) pii[r.parsed.pii]++;
    }
    const hasSentiment = sentiment.positive + sentiment.neutral + sentiment.negative + sentiment.mixed > 0;
    const hasPii = pii.none + pii.low + pii.medium + pii.high > 0;

    const status = classifyHealth({
      analyzerRowCount: periodRows.length,
      pendingResultCount: pending,
      sentiment: hasSentiment ? sentiment : undefined,
      pii: hasPii ? pii : undefined,
    });

    let lastAnalyzedAt: string | undefined;
    for (const r of allRows) {
      if (r.createdOn && (!lastAnalyzedAt || r.createdOn > lastAnalyzedAt)) lastAnalyzedAt = r.createdOn;
    }
    const coverageRatio = totalRows > 0 ? periodRows.length / totalRows : 0;

    return {
      agentDetailsId: a.agentDetailsId,
      agentId: a.agentId,
      name: a.name ?? 'Unnamed agent',
      environmentName: a.environmentName,
      environmentUrl: a.environmentUrl,
      conversations: periodRows.length,
      coverageRatio,
      sentiment: deriveSentiment(sentiment),
      pii: derivePii(pii),
      lastAnalyzedAt,
      hasResults: allRows.length > 0,
      status,
    };
  });
}
