/**
 * BotsGrid Component
 *
 * Displays all agents in a sortable, paginated data grid with Review/View actions.
 * Based on Figma node-id=25-118 and ui-specification.md Section 2.1
 *
 * Features:
 * - 7 columns: Name, Powered by, Score, Issues, Last Reviewed, Review, Details
 * - Client-side pagination (10/25/50/100 per page)
 * - 300ms debounced search
 * - 60px row height
 * - Sortable columns
 */

import React, { useMemo, useState } from 'react';
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
  Skeleton,
  SkeletonItem,
  Text,
  makeStyles,
  tokens,
  Image,
  Tooltip,
} from '@fluentui/react-components';
import {
  BotSparkle24Regular,
  BotSparkle24Color,
  Eye20Regular,
  FolderZipRegular,
  NewFilled,
  NewRegular,
} from '@fluentui/react-icons';
import type { ReviewGridRow } from '../../contracts/ReviewResult';
import { getScoreColor, getScoreLabel } from '../../utils/scoreCalculator';
import { useFilterContext } from '../../context/FilterContext';
import { formatRelativeReviewDate, isRecentlyReviewed } from '../../utils/reviewGridFormat';
import { UNSUPPORTED_HARNESS_MESSAGE } from '../../agents-experience/services/detection';
import { agentHarnessLabel } from '../../utils/agentHarness';

/**
 * BotsGrid props
 */
export interface BotsGridProps {
  /** Grid rows (joined bot + review data) */
  rows: ReviewGridRow[];

  /** Callback when the connected-agent review option is selected */
  onReview: (botId: string, trigger?: HTMLButtonElement) => void;

  /** Callback when View button is clicked */
  onView: (botId: string, trigger?: HTMLButtonElement) => void;

  /**
   * Callback when the ZIP upload review option is selected.
   */
  onReviewFromZip: () => void;

  /** Whether any review is currently executing */
  isReviewingAny?: boolean;

  /** Optional ref for first Review button (for welcome tour) */
  reviewButtonRef?: React.RefObject<HTMLButtonElement | null>;

  /** Optional ref for first View button (for welcome tour) */
  viewButtonRef?: React.RefObject<HTMLButtonElement | null>;

  /** Whether bots/reviews are loading — shows skeleton rows */
  isLoading?: boolean;
}

const useStyles = makeStyles({
  grid: {
    width: '100%',
  },
  nameCellWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    width: '100%',
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0px',
    minWidth: 0,
  },
  nameText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  botIcon: {
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusMedium,
    objectFit: 'cover',
    marginLeft: tokens.spacingHorizontalS,
  },
  nameMediaOffset: {
    marginLeft: tokens.spacingHorizontalS,
  },
  nameIcon: {
    marginLeft: tokens.spacingHorizontalS,
    width: '36px',
    height: '36px',
  },
  newIcon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: '-8px',
  },
  poweredByBadge: {
    whiteSpace: 'nowrap',
  },
  zipBadge: {
    flexShrink: 0,
    marginLeft: tokens.spacingHorizontalXS,
  },
  scoreText: {
    fontSize: '18px',
    fontWeight: 600,
  },
  scorePlaceholder: {
    color: tokens.colorNeutralForeground3,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
  },
  issuesCell: {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: '6px',
    alignItems: 'center',
  },
  reviewedCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  issueCount: {
    fontSize: '18px',
    fontWeight: 600,
    flexShrink: 0,
  },
  highBadge: {
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  reviewButton: {
    minWidth: '80px',
    backgroundColor: '#FFFFFF',
    border: '0.8px solid #d1d1d1',
    borderRadius: '4px',
    color: '#242424',
    '&:hover': {
      backgroundColor: '#f5f5f5',
      border: '0.8px solid #d1d1d1',
    },
    '&:disabled': {
      backgroundColor: '#FFFFFF',
      border: '0.8px solid #d1d1d1',
      opacity: 0.6,
    },
    '&[aria-disabled="true"]': {
      backgroundColor: '#FFFFFF',
      border: '0.8px solid #d1d1d1',
      opacity: 0.6,
      cursor: 'not-allowed',
    },
  },
  viewButton: {
    minWidth: '80px',
    backgroundColor: 'transparent',
    border: '0.8px solid #e0e0e0',
    borderRadius: '4px',
    '&:hover': {
      backgroundColor: '#f5f5f5',
      border: '0.8px solid #e0e0e0',
    },
    '&:disabled': {
      backgroundColor: 'transparent',
      border: '0.8px solid #e0e0e0',
      color: '#bdbdbd',
    },
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    height: '60px',
    padding: '0 12px',
    gap: '16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  skeletonName: {
    flex: '0 0 360px',
    height: '16px',
  },
  skeletonSmall: {
    flex: '0 0 80px',
    height: '16px',
  },
  skeletonMedium: {
    flex: '0 0 140px',
    height: '16px',
  },
  skeletonButton: {
    flex: '0 0 90px',
    height: '28px',
    borderRadius: '4px',
  },
  skeletonHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    height: '60px',
    padding: '0 12px',
    gap: '16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

/**
 * BotsGrid component
 *
 * @example
 * ```tsx
 * <BotsGrid
 *   rows={gridRows}
 *   onReview={(botId) => executeReview(botId)}
 *   onView={(botId) => openDialog(botId)}
 * />
 * ```
 */
export function BotsGrid({
  rows,
  onReview,
  onView,
  onReviewFromZip,
  isReviewingAny = false,
  reviewButtonRef,
  viewButtonRef,
  isLoading = false,
}: BotsGridProps) {
  const styles = useStyles();
  const { searchQuery, currentPage, pageSize } = useFilterContext();
  const [hoveredBotId, setHoveredBotId] = useState<string | null>(null);

  const columnSizingOptions: TableColumnSizingOptions = {
    name: { defaultWidth: 300, minWidth: 200 },
    poweredBy: { defaultWidth: 140, minWidth: 120 },
    score: { defaultWidth: 90, minWidth: 70 },
    issues: { defaultWidth: 150, minWidth: 130 },
    lastReviewed: { defaultWidth: 140, minWidth: 110 },
    review: { defaultWidth: 130, minWidth: 120 },
    details: { defaultWidth: 100, minWidth: 80 },
  };

  // Filter rows by search query
  const filteredRows = useMemo(() => {
    if (!searchQuery) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter((row) => row.botName.toLowerCase().includes(query));
  }, [rows, searchQuery]);

  // Paginate rows
  const paginatedRows = useMemo(() => {
    const startIndex = currentPage * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredRows.slice(startIndex, endIndex);
  }, [filteredRows, currentPage, pageSize]);

  // Define columns (per Figma node-id=25-118)
  const columns: TableColumnDefinition<ReviewGridRow>[] = [
    createTableColumn<ReviewGridRow>({
      columnId: 'name',
      compare: (a, b) => a.botName.localeCompare(b.botName),
      renderHeaderCell: () => <span className={styles.nameMediaOffset}>Name</span>,
      renderCell: (row) => (
        <div className={styles.nameCellWrapper}>
          {row.iconBase64 ? (
            <Image
              src={`data:image/png;base64,${row.iconBase64}`}
              alt=""
              className={styles.botIcon}
            />
          ) : hoveredBotId === row.botId ? (
            <BotSparkle24Color className={styles.nameIcon} aria-hidden="true" />
          ) : (
            <BotSparkle24Regular className={styles.nameIcon} aria-hidden="true" />
          )}
          <div className={styles.nameCell}>
            {isRecentlyReviewed(row.reviewedOn) && (
              hoveredBotId === row.botId
                ? <NewFilled className={styles.newIcon} fontSize={18} aria-label="Recently reviewed" />
                : <NewRegular className={styles.newIcon} fontSize={18} aria-label="Recently reviewed" />
            )}
            <span className={styles.nameText} title={row.botName}>{row.botName}</span>
            {row.isZipSource && (
              <Badge
                appearance="tint"
                color="brand"
                size="small"
                icon={<FolderZipRegular />}
                className={styles.zipBadge}
              >
                ZIP
              </Badge>
            )}
          </div>
        </div>
      ),
    }),
    createTableColumn<ReviewGridRow>({
      columnId: 'poweredBy',
      compare: (a, b) => (a.harness ?? 'standard').localeCompare(b.harness ?? 'standard'),
      renderHeaderCell: () => 'Powered by',
      renderCell: (row) =>
        row.harness === 'unsupported' ? (
          <Tooltip content={UNSUPPORTED_HARNESS_MESSAGE} relationship="description">
            <Badge
              appearance="tint"
              color="warning"
              size="small"
              shape="circular"
              className={styles.poweredByBadge}
            >
              {agentHarnessLabel(row.harness)}
            </Badge>
          </Tooltip>
        ) : (
          <Badge
            appearance="tint"
            color="subtle"
            size="small"
            shape="circular"
            className={styles.poweredByBadge}
          >
            {agentHarnessLabel(row.harness)}
          </Badge>
        ),
    }),
    createTableColumn<ReviewGridRow>({
      columnId: 'score',
      compare: (a, b) =>
        (a.overallScoreApplicable === false ? -1 : a.overallScore) -
        (b.overallScoreApplicable === false ? -1 : b.overallScore),
      renderHeaderCell: () => 'Score',
      renderCell: (row) => {
        if (row.status === 'not-reviewed') {
          return <span className={styles.scorePlaceholder}>--</span>;
        }
        if (row.overallScoreApplicable === false) {
          return <span className={styles.scorePlaceholder}>N/A</span>;
        }
        const color = getScoreColor(row.overallScore);
        // color is a dynamic per-row value — cannot be a static CSS class
        return (
          <span className={styles.scoreText} style={{ color }}>
            {row.overallScore}%
            <span className={styles.visuallyHidden}>
              {' '}- {getScoreLabel(row.overallScore)}
            </span>
          </span>
        );
      },
    }),
    createTableColumn<ReviewGridRow>({
      columnId: 'issues',
      compare: (a, b) => a.totalIssueCount - b.totalIssueCount,
      renderHeaderCell: () => 'Issues',
      renderCell: (row) => {
        if (row.status === 'not-reviewed') {
          return <span className={styles.scorePlaceholder}>--</span>;
        }
        return (
          <div className={styles.issuesCell}>
            <span className={styles.issueCount}>{row.totalIssueCount}</span>
            {row.highSeverityCount > 0 && (
              <Badge
                appearance="filled"
                color="danger"
                size="medium"
                shape="rounded"
                className={styles.highBadge}
              >
                {row.highSeverityCount} high
              </Badge>
            )}
          </div>
        );
      },
    }),
    createTableColumn<ReviewGridRow>({
      columnId: 'lastReviewed',
      compare: (a, b) => (a.reviewedOn?.getTime() ?? 0) - (b.reviewedOn?.getTime() ?? 0),
      renderHeaderCell: () => 'Last Reviewed',
      renderCell: (row) => (
        <div className={styles.reviewedCell}>
          <Text size={200}>{formatRelativeReviewDate(row.reviewedOn)}</Text>
        </div>
      ),
    }),
    createTableColumn<ReviewGridRow>({
      columnId: 'review',
      renderHeaderCell: () => 'Review',
      renderCell: (row) => {
        const isFirstRow = paginatedRows[0]?.botId === row.botId;
        const isUnsupported = row.harness === 'unsupported';
        const reviewButton = (
          <Button
            ref={isFirstRow ? reviewButtonRef : undefined}
            size="medium"
            icon={row.isZipSource ? <FolderZipRegular /> : <BotSparkle24Color />}
            disabled={isReviewingAny}
            disabledFocusable={isUnsupported}
            className={styles.reviewButton}
            onClick={() =>
              row.isZipSource ? onReviewFromZip() : onReview(row.botId)
            }
            aria-label={
              isUnsupported
                ? `Review is not available for ${row.botName}`
                : row.isZipSource
                  ? `Review ${row.botName} from a solution ZIP`
                  : `Review connected agent ${row.botName}`
            }
          >
            Review
          </Button>
        );

        // Issue 947: disabledFocusable keeps the button in the tab order, so the tooltip can show.
        return isUnsupported ? (
          <Tooltip content={UNSUPPORTED_HARNESS_MESSAGE} relationship="description">
            {reviewButton}
          </Tooltip>
        ) : (
          reviewButton
        );
      },
    }),
    createTableColumn<ReviewGridRow>({
      columnId: 'details',
      renderHeaderCell: () => 'Details',
      renderCell: (row) => {
        // View is enabled only when review detail data exists (memo field or legacy file column)
        const canView = row.status === 'completed' && !!row.hasReviewData;
        const isFirstRow = paginatedRows[0]?.botId === row.botId;
        return (
          <Button
            ref={isFirstRow ? viewButtonRef : undefined}
            size="medium"
            icon={<Eye20Regular />}
            onClick={(event) => onView(row.botId, event.currentTarget)}
            disabled={!canView}
            className={styles.viewButton}
            aria-label={`View review for ${row.botName}`}
          >
            View
          </Button>
        );
      },
    }),
  ];

  if (isLoading) {
    return (
      <Skeleton>
        {/* Header row placeholder — 7 columns */}
        <div className={styles.skeletonHeaderRow}>
          <SkeletonItem className={styles.skeletonName} />
          <SkeletonItem className={styles.skeletonMedium} />
          <SkeletonItem className={styles.skeletonSmall} />
          <SkeletonItem className={styles.skeletonSmall} />
          <SkeletonItem className={styles.skeletonMedium} />
          <SkeletonItem className={styles.skeletonButton} />
          <SkeletonItem className={styles.skeletonButton} />
        </div>
        {/* Data rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <SkeletonItem className={styles.skeletonName} />
            <SkeletonItem className={styles.skeletonMedium} />
            <SkeletonItem className={styles.skeletonSmall} />
            <SkeletonItem className={styles.skeletonSmall} />
            <SkeletonItem className={styles.skeletonMedium} />
            <SkeletonItem className={styles.skeletonButton} />
            <SkeletonItem className={styles.skeletonButton} />
          </div>
        ))}
      </Skeleton>
    );
  }

  return (
    <DataGrid
      items={paginatedRows}
      columns={columns}
      sortable
      className={styles.grid}
      resizableColumns
      columnSizingOptions={columnSizingOptions}
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell }) => (
            <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
          )}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<ReviewGridRow>>
        {({ item, rowId }) => (
          <DataGridRow<ReviewGridRow>
            key={rowId}
            style={{ height: '60px' }}
            onMouseEnter={() => setHoveredBotId(item.botId)}
            onMouseLeave={() => setHoveredBotId(null)}
          >
            {({ renderCell }) => (
              <DataGridCell>{renderCell(item)}</DataGridCell>
            )}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
  );
}
