/**
 * PatternsDataGrid Component
 *
 * Existing standard-review grid, with explicit outcomes and accessible details
 * for excluded or unassessed checks even when no setting was captured.
 */

import React from 'react';
import {
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridBody,
  DataGridCell,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
  createTableColumn,
  Button,
  Badge,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
  useRestoreFocusTarget,
} from '@fluentui/react-components';
import { ChevronRight20Regular } from '@fluentui/react-icons';
import type { PatternDisplayRow } from '../../contracts/ReviewResult';
import { AssessmentStatusBadge } from '../core/AssessmentStatusBadge';
import { getAssessmentStatusDescription } from '../core/assessmentStatus';

export interface PatternsDataGridProps {
  patterns: PatternDisplayRow[];
  onViewDetails: (pattern: PatternDisplayRow, trigger: HTMLButtonElement) => void;
  /** ID of the row currently shown in the detail panel — highlights it in the grid */
  selectedId?: string;
}

const useStyles = makeStyles({
  grid: {
    minWidth: '100%',
  },
  scroller: { overflowX: 'auto', maxWidth: '100%', minWidth: 0 },
  numericCell: { justifyContent: 'flex-end', textAlign: 'right' },
  selectedRow: {
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
  patternCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  topicCount: {
    fontWeight: tokens.fontWeightSemibold,
  },
  topicCountZero: {
    fontWeight: tokens.fontWeightRegular,
  },
});

/** Render saved pattern outcomes with neutral availability states and accessible details actions. */
export function PatternsDataGrid({ patterns, onViewDetails, selectedId }: PatternsDataGridProps) {
  const styles = useStyles();
  const findingFocusTarget = useRestoreFocusTarget();

  const columnSizingOptions: TableColumnSizingOptions = {
    status:      { minWidth: 100, defaultWidth: 110 },
    severity:    { minWidth: 60,  defaultWidth: 80  },
    category:    { minWidth: 110, defaultWidth: 130 },
    pattern:     { minWidth: 280, defaultWidth: 420 },
    topics:      { minWidth: 100, defaultWidth: 110 },
    actions:     { minWidth: 70,  defaultWidth: 95  },
  };

  const columns: TableColumnDefinition<PatternDisplayRow>[] = [
    createTableColumn<PatternDisplayRow>({
      columnId: 'status',
      compare: (a, b) => a.statusLabel.localeCompare(b.statusLabel),
      renderHeaderCell: () => 'Status',
      renderCell: (row) => (
        <AssessmentStatusBadge
          status={row.status}
          statusColor={row.statusColor}
          statusLabel={row.statusLabel}
        />
      ),
    }),
    createTableColumn<PatternDisplayRow>({
      columnId: 'severity',
      compare: (a, b) => {
        const order = { High: 0, Medium: 1, Low: 2 };
        return order[a.severity] - order[b.severity];
      },
      renderHeaderCell: () => 'Severity',
      renderCell: (row) => (
        <Badge shape="rounded" appearance="outline" color={row.severityColor} size="small" aria-label={`Inherent severity: ${row.severity}`}>
          {row.severity}
        </Badge>
      ),
    }),
    createTableColumn<PatternDisplayRow>({
      columnId: 'category',
      compare: (a, b) => a.categorySortOrder - b.categorySortOrder,
      renderHeaderCell: () => 'Category',
      renderCell: (row) => <Badge shape="rounded" appearance="outline" color="informative" size="small">{row.category}</Badge>,
    }),
    createTableColumn<PatternDisplayRow>({
      columnId: 'pattern',
      compare: (a, b) => a.patternName.localeCompare(b.patternName),
      renderHeaderCell: () => 'Pattern',
      renderCell: (row) => (
        <div className={styles.patternCell}>
          <span>{row.patternName}</span>
        </div>
      ),
    }),
    createTableColumn<PatternDisplayRow>({
      columnId: 'topics',
      compare: (a, b) => a.topicCount - b.topicCount,
      renderHeaderCell: () => 'Affected items',
      renderCell: (row) => (
        <span className={row.topicCount > 0 ? styles.topicCount : styles.topicCountZero}>
          {row.topicCount}
        </span>
      ),
    }),
    createTableColumn<PatternDisplayRow>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (row) => (
        <Button
          {...findingFocusTarget}
          appearance="subtle"
          size="small"
          icon={<ChevronRight20Regular />}
          disabled={row.topicCount === 0 && row.status === true}
          aria-label={`Details for ${row.patternName}: ${row.statusLabel}`}
          onClick={(event) => onViewDetails(row, event.currentTarget)}
        >
          Details
        </Button>
      ),
    }),
  ];

  if (patterns.length === 0) {
    return (
      <MessageBar intent="info" aria-live="polite">
        <MessageBarBody>
          <MessageBarTitle>Pattern assessment unavailable</MessageBarTitle>
          Pattern assessment data is unavailable. No completed checks can be shown.
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.scroller}>
    <DataGrid
      items={patterns}
      columns={columns}
      sortable
      resizableColumns
      columnSizingOptions={columnSizingOptions}
      size="small"
      className={styles.grid}
      getRowId={(row) => row.id}
      focusMode="cell"
      aria-label="Pattern assessment checks"
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell, columnId }) => (
            <DataGridHeaderCell className={columnId === 'topics' ? styles.numericCell : undefined}>{renderHeaderCell()}</DataGridHeaderCell>
          )}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<PatternDisplayRow>>
        {({ item, rowId }) => (
          <DataGridRow<PatternDisplayRow>
            key={rowId}
            className={item.id === selectedId ? styles.selectedRow : undefined}
          >
            {({ renderCell, columnId }) => (
              <DataGridCell
                className={columnId === 'topics' ? styles.numericCell : undefined}
                focusMode={
                  columnId === 'status' && getAssessmentStatusDescription(item.statusLabel)
                    ? 'group'
                    : columnId === 'actions' && !(item.topicCount === 0 && item.status === true)
                    ? 'group'
                    : 'cell'
                }
              >
                {renderCell(item)}
              </DataGridCell>
            )}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
    </div>
  );
}
