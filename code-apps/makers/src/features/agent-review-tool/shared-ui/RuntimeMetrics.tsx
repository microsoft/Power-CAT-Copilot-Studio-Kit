/**
 * The six headline numbers for a runtime analysis.
 *
 * Takes a flat summary rather than either app's report model. The Architecture Review app's
 * `RuntimeReport` carries roughly forty fields, most of which feed the sections further down the
 * tab; binding this row to that type would make the Agent Review Tool import a model it has no
 * other use for, and would tie the card layout to a schema version.
 *
 * Formatting lives here rather than in the callers precisely because there are two callers. A
 * duration rendered "15.2 s" in one app and "15,200 ms" in the other is the kind of difference that
 * makes two screens look like two products.
 */

import { MetricCard, MetricCardGroup } from './MetricCard';
import { formatCount, formatPercent, pluralize } from './format';
import { timingCard, type RuntimeMetricsSummary } from './runtimeSummary';

// Re-exported so callers can import the row, its view model and its formatting from one module.
export { formatCount, formatDuration, formatPercent, pluralize } from './format';
export { timingCard } from './runtimeSummary';
export type { RuntimeMetricsSummary, TimingCard } from './runtimeSummary';

export interface RuntimeMetricsProps {
  /** Omitted while the first analysis is still running, which renders the cards as placeholders. */
  summary?: RuntimeMetricsSummary;
  /** Greys the values without collapsing the row, so a re-run does not make the layout jump. */
  pending?: boolean;
}

export function RuntimeMetrics({ summary, pending }: RuntimeMetricsProps) {
  const unknown = summary === undefined;
  const placeholder = unknown || pending;
  const timing = timingCard(summary);

  return (
    <MetricCardGroup>
      <MetricCard
        label="Conversations analysed"
        value={formatCount(summary?.transcriptsAnalyzed ?? 0)}
        // Only worth showing when the two numbers differ. "10 transcript rows" under "10
        // conversations analysed" is noise; the counts diverge badly on real data, which is the
        // case the detail exists for.
        detail={
          summary && summary.transcriptRowsAnalyzed > summary.transcriptsAnalyzed
            ? pluralize(summary.transcriptRowsAnalyzed, 'transcript row')
            : undefined
        }
        pending={placeholder}
      />
      <MetricCard
        label="Conversations with errors"
        value={formatCount(summary?.conversationsWithErrors ?? 0)}
        detail={
          unknown ? undefined : `${formatPercent(summary.errorRatePercent)} of conversations`
        }
        // Errors rising is bad news however small the number, so this card never shows green.
        trend={summary && summary.conversationsWithErrors > 0 ? 'up-bad' : 'neutral'}
        pending={placeholder}
      />
      <MetricCard
        label="Distinct error types"
        value={formatCount(summary?.uniqueErrorTypes ?? 0)}
        detail={unknown ? undefined : pluralize(summary.totalErrors, 'occurrence')}
        pending={placeholder}
      />
      <MetricCard
        label="Tool calls"
        value={formatCount(summary?.totalToolCalls ?? 0)}
        pending={placeholder}
      />
      <MetricCard
        label={timing.label}
        value={timing.value}
        detail={unknown ? undefined : timing.detail}
        pending={placeholder}
      />
      <MetricCard
        label="Knowledge searches"
        value={formatCount(summary?.totalKnowledgeSearches ?? 0)}
        detail={summary?.knowledgeConfiguredButUnused ? 'Configured but never searched' : undefined}
        pending={placeholder}
      />
    </MetricCardGroup>
  );
}
