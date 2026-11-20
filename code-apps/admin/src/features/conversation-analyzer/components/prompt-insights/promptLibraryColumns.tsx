/** Column definitions for the Prompt library grid (PI-6, PI-7). */

import {
  Body1, Button, Caption1, Text, createTableColumn, type TableColumnDefinition,
} from '@fluentui/react-components';
import type { PromptInsightRow } from '../../hooks/usePromptInsightsData';
import { getPromptLabel } from '../../utils/format';
import { DotLabel } from '../shared/DotLabel';
import { PromptTypeBadge } from '../shared/PromptPreview';
import { formatRelativeTime, getPromptInitials } from './promptInsightsUtils';
import type { useLibraryCellStyles } from './promptLibraryStyles';

type CellStyles = ReturnType<typeof useLibraryCellStyles>;

export function createLibraryColumns(
  styles: CellStyles,
  maxRuns: number,
  onViewDetails: (row: PromptInsightRow) => void,
): TableColumnDefinition<PromptInsightRow>[] {
  return [
    createTableColumn<PromptInsightRow>({
      columnId: 'prompt',
      compare: (a, b) => getPromptLabel(a).localeCompare(getPromptLabel(b)),
      renderHeaderCell: () => 'Prompt',
      renderCell: (row) => {
        const name = getPromptLabel(row);
        return (
          <div className={styles.promptCell}>
            <span className={styles.initials} aria-hidden="true">{getPromptInitials(name)}</span>
            <Body1 className={styles.ellipsis} title={name}>{name}</Body1>
          </div>
        );
      },
    }),
    createTableColumn<PromptInsightRow>({
      columnId: 'type',
      compare: (a, b) => a.scope.localeCompare(b.scope),
      renderHeaderCell: () => 'Prompt type',
      renderCell: (row) => <PromptTypeBadge scope={row.scope} />,
    }),
    createTableColumn<PromptInsightRow>({
      columnId: 'insight',
      renderHeaderCell: () => 'Latest insight',
      renderCell: (row) => row.latestSummary
        ? <Text size={200} className={styles.insight} title={row.latestSummary}>{row.latestSummary}</Text>
        : <Caption1 className={styles.noInsight}>No results yet</Caption1>,
    }),
    createTableColumn<PromptInsightRow>({
      columnId: 'runs',
      compare: (a, b) => a.runsCount - b.runsCount,
      renderHeaderCell: () => <span className={styles.headerRight}>Runs</span>,
      renderCell: (row) => (
        <div className={styles.runs}>
          <Body1 className={styles.runsNum}>{row.runsCount.toLocaleString()}</Body1>
          <span className={styles.miniTrack} aria-hidden="true">
            <span className={styles.miniFill} style={{ width: `${(row.runsCount / Math.max(1, maxRuns)) * 100}%` }} />
          </span>
        </div>
      ),
    }),
    createTableColumn<PromptInsightRow>({
      columnId: 'lastRun',
      compare: (a, b) => (a.lastRunOn ?? '').localeCompare(b.lastRunOn ?? ''),
      renderHeaderCell: () => 'Last run',
      renderCell: (row) => row.lastRunOn
        ? <DotLabel tone="success">{formatRelativeTime(row.lastRunOn)}</DotLabel>
        : <DotLabel tone="subtle" muted>Never run</DotLabel>,
    }),
    createTableColumn<PromptInsightRow>({
      columnId: 'actions',
      renderHeaderCell: () => <span className={styles.srOnly}>Actions</span>,
      renderCell: (row) => (
        <Button
          className={styles.action}
          appearance="subtle"
          size="small"
          aria-label={`View details for ${getPromptLabel(row)}`}
          onClick={() => onViewDetails(row)}
        >
          View details
        </Button>
      ),
    }),
  ];
}
