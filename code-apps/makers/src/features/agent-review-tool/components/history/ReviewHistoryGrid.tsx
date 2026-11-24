import { Button } from '@fluentui/react-components';
import { Eye20Regular } from '@fluentui/react-icons';
import {
  FluentDataGrid,
  type FluentDataGridColumn,
} from '../../../../shared/components/FluentDataGrid';
import type { ReviewHistoryEntry } from '../../contracts/ReviewResult';
import type {
  ReviewHistorySortColumn,
} from '../../hooks/useReviewHistoryView';
import { formatDateTime } from '../../utils/dateUtils';
import { ReviewFreshnessBadge } from './ReviewFreshnessBadge';
import {
  reviewScoreLabel,
  reviewTypeLabel,
  reviewVersionLabel,
} from './reviewHistoryPresentation';

export interface ReviewHistoryGridProps {
  entries: ReviewHistoryEntry[];
  selectedReviewId: string | null;
  sortColumn: ReviewHistorySortColumn;
  sortDirection: 'ascending' | 'descending';
  onSortChange: (column: ReviewHistorySortColumn) => void;
  onOpenReview: (entry: ReviewHistoryEntry) => void;
}

const sortableColumns = new Set<ReviewHistorySortColumn>([
  'agentVersion',
  'reviewedOn',
  'overallScore',
  'totalIssueCount',
  'highSeverityCount',
  'reviewKind',
  'freshness',
]);

/**
 * Default List representation for review history.
 */
export function ReviewHistoryGrid({
  entries,
  selectedReviewId,
  sortColumn,
  sortDirection,
  onSortChange,
  onOpenReview,
}: ReviewHistoryGridProps) {
  const columns: FluentDataGridColumn<ReviewHistoryEntry>[] = [
    {
      columnId: 'agentVersion',
      label: 'Version',
      width: '80px',
      renderCell: reviewVersionLabel,
    },
    {
      columnId: 'reviewedOn',
      label: 'Reviewed',
      width: '140px',
      renderCell: (entry) => formatDateTime(entry.reviewedOn),
    },
    {
      columnId: 'overallScore',
      label: 'Score',
      width: '120px',
      alignment: 'end',
      renderCell: reviewScoreLabel,
    },
    {
      columnId: 'totalIssueCount',
      label: 'Stored issues',
      width: '110px',
      alignment: 'end',
      renderCell: (entry) => entry.totalIssueCount,
    },
    {
      columnId: 'highSeverityCount',
      label: 'Stored high',
      width: '110px',
      alignment: 'end',
      renderCell: (entry) => entry.highSeverityCount,
    },
    {
      columnId: 'reviewKind',
      label: 'Review type',
      width: '120px',
      renderCell: reviewTypeLabel,
    },
    {
      columnId: 'freshness',
      label: 'Status',
      width: '130px',
      renderCell: (entry) => <ReviewFreshnessBadge freshness={entry.freshness} />,
    },
    {
      columnId: 'details',
      label: 'Details',
      width: '90px',
      sortable: false,
      renderCell: (entry) => (
        <Button
          appearance="subtle"
          icon={<Eye20Regular />}
          aria-current={entry.reviewId === selectedReviewId
            ? 'true'
            : undefined}
          aria-label={`View review from ${formatDateTime(entry.reviewedOn)}`}
          onClick={() => onOpenReview(entry)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <FluentDataGrid
      items={entries}
      columns={columns}
      getRowId={(entry) => entry.reviewId}
      sortState={{ sortColumn, sortDirection }}
      onSortChange={(state) => {
        const column = String(state.sortColumn) as ReviewHistorySortColumn;
        if (sortableColumns.has(column)) onSortChange(column);
      }}
    />
  );
}
