/**
 * ComplianceDataGrid Component
 *
 * Existing standard-review criteria grid. Incomplete or excluded assessments
 * remain neutral and their details are accessible even without recorded issues.
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
import type { ComplianceDisplayRow } from '../../contracts/ReviewResult';
import { AssessmentStatusBadge } from '../core/AssessmentStatusBadge';
import { getAssessmentStatusDescription } from '../core/assessmentStatus';

export interface ComplianceDataGridProps {
  criteria: ComplianceDisplayRow[];
  onViewDetails: (criterion: ComplianceDisplayRow, trigger: HTMLButtonElement) => void;
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
  criteriaCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  issueCount: {
    fontWeight: tokens.fontWeightSemibold,
  },
  issueCountZero: {
    fontWeight: tokens.fontWeightRegular,
  },
});

/** Render saved instruction outcomes without treating excluded criteria as passes or failures. */
export function ComplianceDataGrid({ criteria, onViewDetails, selectedId }: ComplianceDataGridProps) {
  const styles = useStyles();
  const findingFocusTarget = useRestoreFocusTarget();

  const columnSizingOptions: TableColumnSizingOptions = {
    status:   { minWidth: 100, defaultWidth: 110 },
    severity: { minWidth: 80,  defaultWidth: 100 },
    category: { minWidth: 100, defaultWidth: 120 },
    criteria: { minWidth: 120, defaultWidth: 200 },
    issues:   { minWidth: 70,  defaultWidth: 80  },
    actions:  { minWidth: 90,  defaultWidth: 100 },
  };

  const columns: TableColumnDefinition<ComplianceDisplayRow>[] = [
    createTableColumn<ComplianceDisplayRow>({
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
    createTableColumn<ComplianceDisplayRow>({
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
    createTableColumn<ComplianceDisplayRow>({
      columnId: 'category',
      compare: (a, b) => a.categorySortOrder - b.categorySortOrder,
      renderHeaderCell: () => 'Category',
      renderCell: (row) => <Badge shape="rounded" appearance="outline" color="informative" size="small">{row.category}</Badge>,
    }),
    createTableColumn<ComplianceDisplayRow>({
      columnId: 'criteria',
      compare: (a, b) => a.criteriaName.localeCompare(b.criteriaName),
      renderHeaderCell: () => 'Criteria',
      renderCell: (row) => (
        <div className={styles.criteriaCell}>
          <span>{row.criteriaName}</span>
        </div>
      ),
    }),
    createTableColumn<ComplianceDisplayRow>({
      columnId: 'issues',
      compare: (a, b) => a.issueCount - b.issueCount,
      renderHeaderCell: () => 'Findings',
      renderCell: (row) => (
        <span className={row.issueCount > 0 ? styles.issueCount : styles.issueCountZero}>
          {row.issueCount}
        </span>
      ),
    }),
    createTableColumn<ComplianceDisplayRow>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (row) => (
        <Button
          {...findingFocusTarget}
          appearance="subtle"
          size="small"
          icon={<ChevronRight20Regular />}
          disabled={row.issueCount === 0 && row.status === true}
          aria-label={`Details for ${row.criteriaName}: ${row.statusLabel}`}
          onClick={(event) => onViewDetails(row, event.currentTarget)}
        >
          Details
        </Button>
      ),
    }),
  ];

  if (criteria.length === 0) {
    return (
      <MessageBar intent="info" aria-live="polite">
        <MessageBarBody>
          <MessageBarTitle>Instruction assessment unavailable</MessageBarTitle>
          Instruction assessment data is unavailable. No completed criteria can be shown.
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.scroller}>
    <DataGrid
      items={criteria}
      columns={columns}
      sortable
      resizableColumns
      columnSizingOptions={columnSizingOptions}
      size="small"
      className={styles.grid}
      getRowId={(row) => row.id}
      focusMode="cell"
      aria-label="Instruction assessment criteria"
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell, columnId }) => (
            <DataGridHeaderCell className={columnId === 'issues' ? styles.numericCell : undefined}>{renderHeaderCell()}</DataGridHeaderCell>
          )}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<ComplianceDisplayRow>>
        {({ item, rowId }) => (
          <DataGridRow<ComplianceDisplayRow>
            key={rowId}
            className={item.id === selectedId ? styles.selectedRow : undefined}
          >
            {({ renderCell, columnId }) => (
              <DataGridCell
                className={columnId === 'issues' ? styles.numericCell : undefined}
                focusMode={
                  columnId === 'status' && getAssessmentStatusDescription(item.statusLabel)
                    ? 'group'
                    : columnId === 'actions' && !(item.issueCount === 0 && item.status === true)
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
