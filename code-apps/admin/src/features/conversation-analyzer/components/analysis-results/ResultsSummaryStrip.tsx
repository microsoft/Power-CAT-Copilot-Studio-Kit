import { Button, tokens } from '@fluentui/react-components';
import { Filter16Regular } from '@fluentui/react-icons';
import type { AnalysisResultRow } from '../../hooks/useAnalysisResultRows';
import { getFlagLabel } from '../../utils/analysisOutcome';
import { formatCompactDuration } from '../../utils/format';
import { KpiStrip, type KpiStripTile } from '../shared/KpiStrip';

interface ResultsSummaryStripProps {
  rows: readonly AnalysisResultRow[];
  isLoading?: boolean;
  flagFilter: boolean;
  onToggleFlagFilter: () => void;
}

/** Results summary: total, average duration, prompt-specific flag (click to filter) and completed % (AR-2). */
export function ResultsSummaryStrip({ rows, isLoading, flagFilter, onToggleFlagFilter }: ResultsSummaryStripProps) {
  const total = rows.length;
  const durations = rows.map((r) => r.durationSeconds).filter((d): d is number => d != null);
  const avgDuration = durations.length ? durations.reduce((sum, d) => sum + d, 0) / durations.length : undefined;
  const kinds = new Set(rows.map((r) => r.outcome.kind));
  const flagKind = kinds.size === 1 ? [...kinds][0] : undefined;
  const flagLabel = getFlagLabel(flagKind);
  const flagged = rows.filter((r) => r.outcome.flagged).length;
  const completed = rows.filter((r) => r.completed).length;
  const completedPct = total ? Math.round((completed / total) * 100) : 0;

  const tiles: KpiStripTile[] = [
    { id: 'total', label: 'Total conversations', value: total.toLocaleString() },
    { id: 'duration', label: 'Avg duration', value: avgDuration != null ? formatCompactDuration(avgDuration) : '—' },
  ];
  if (flagLabel) {
    tiles.push({
      id: 'flag',
      label: flagLabel,
      value: flagged.toLocaleString(),
      color: tokens.colorPaletteRedBorderActive,
      visual: flagged > 0 ? (
        <Button
          size="small"
          appearance={flagFilter ? 'primary' : 'subtle'}
          icon={<Filter16Regular />}
          aria-pressed={flagFilter}
          onClick={onToggleFlagFilter}
        >
          {flagFilter ? 'Showing only' : 'Show only'}
        </Button>
      ) : undefined,
    });
  }
  tiles.push({
    id: 'completed',
    label: 'Completed',
    value: completed.toLocaleString(),
    valueSuffix: total ? `${completedPct}%` : undefined,
  });

  return <KpiStrip tiles={tiles} isLoading={isLoading} ariaLabel="Results summary" />;
}
