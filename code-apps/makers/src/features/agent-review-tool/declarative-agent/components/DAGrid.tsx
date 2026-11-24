/**
 * DAGrid Component
 *
 * DataGrid for DA reviews — styled identically to BotsGrid.
 * Columns: Name, Score, Last Reviewed, Source, Review, Details.
 * Pagination is owned by the parent and rendered outside this component.
 */

import { useState } from 'react';
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
  Badge,
  Button,
  Text,
  Card,
  Skeleton,
  SkeletonItem,
  Image,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Agents28Regular,
  Agents28Color,
  BotSparkle24Color,
  Eye20Regular,
  FolderZipRegular,
  NewRegular,
  NewFilled,
} from '@fluentui/react-icons';
import type { DAGridRow } from '../contracts/DAReviewRecord';
import { DA_SCORE_THRESHOLDS } from '../contracts/constants';
import { formatRelativeReviewDate, isRecentlyReviewed } from '../../utils/reviewGridFormat';

const useStyles = makeStyles({
  grid: {
    width: '100%',
  },
  scoreText: {
    fontSize: '18px',
    fontWeight: '600',
  },
  scorePlaceholder: {
    color: tokens.colorNeutralForeground3,
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
  botIcon: {
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusMedium,
    objectFit: 'cover',
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
  nameCellMedia: {
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
  emptyCard: {
    maxWidth: '360px',
    margin: '40px auto',
    textAlign: 'center',
    padding: tokens.spacingVerticalXL,
  },
  emptyTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
  },
  emptyIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  emptyActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
    alignItems: 'center',
  },
  emptyDescText: {
    color: tokens.colorNeutralForeground2,
    marginTop: tokens.spacingVerticalXS,
  },
  // Skeleton styles matching BotsGrid exactly
  skeletonHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    height: '60px',
    padding: '0 12px',
    gap: '16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    height: '60px',
    padding: '0 12px',
    gap: '16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  skeletonName: { flex: '0 0 360px', height: '16px' },
  skeletonSmall: { flex: '0 0 80px', height: '16px' },
  skeletonMedium: { flex: '0 0 140px', height: '16px' },
  skeletonButton: { flex: '0 0 90px', height: '28px', borderRadius: '4px' },
});

function getScoreColor(score: number): string {
  if (score >= DA_SCORE_THRESHOLDS.PASS) return '#107c10'; // Green — Pass  (5.4:1, WCAG AA)
  if (score >= DA_SCORE_THRESHOLDS.WARNING) return '#b7580a'; // Amber — Warning (4.76:1)
  return '#c50f1f';                                            // Red — Fail (6.1:1)
}

export interface DAGridProps {
  rows: DAGridRow[];
  isLoading?: boolean;
  onReview: (row: DAGridRow) => void;
  onViewResults: (row: DAGridRow) => void;
  onUploadZip: () => void;
}

export function DAGrid({
  rows,
  isLoading = false,
  onReview,
  onViewResults,
  onUploadZip,
}: DAGridProps) {
  const styles = useStyles();
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const columnSizingOptions: TableColumnSizingOptions = {
    name: { defaultWidth: 280, minWidth: 160 },
    score: { defaultWidth: 90, minWidth: 70 },
    lastReviewed: { defaultWidth: 130, minWidth: 90 },
    source: { defaultWidth: 90, minWidth: 70 },
    publisher: { defaultWidth: 160, minWidth: 100 },
    review: { defaultWidth: 110, minWidth: 90 },
    view: { defaultWidth: 100, minWidth: 80 },
  };

  const columns: TableColumnDefinition<DAGridRow>[] = [
    createTableColumn<DAGridRow>({
      columnId: 'name',
      compare: (a, b) => a.agentName.localeCompare(b.agentName),
      renderHeaderCell: () => <span className={styles.nameCellMedia}>Name</span>,
      renderCell: (row) => (
        <div className={styles.nameCellWrapper}>
          {row.iconBase64 ? (
            <Image src={row.iconBase64} alt={row.agentName} className={`${styles.botIcon} ${styles.nameIcon}`} />
          ) : hoveredRowId === row.componentIdUnique ? (
            <Agents28Color className={styles.nameIcon} aria-hidden="true" />
          ) : (
            <Agents28Regular className={styles.nameIcon} aria-hidden="true" />
          )}
          <div className={styles.nameCell}>
            {isRecentlyReviewed(row.reviewedOn) && (
              hoveredRowId === row.componentIdUnique
                ? <NewFilled className={styles.newIcon} fontSize={18} aria-label="Recently reviewed" />
                : <NewRegular className={styles.newIcon} fontSize={18} aria-label="Recently reviewed" />
            )}
            {row.agentName}
          </div>
        </div>
      ),
    }),
    createTableColumn<DAGridRow>({
      columnId: 'score',
      compare: (a, b) => (a.overallScore ?? -1) - (b.overallScore ?? -1),
      renderHeaderCell: () => 'Score',
      renderCell: (row) =>
        row.overallScore !== undefined ? (
          <span className={styles.scoreText} style={{ color: getScoreColor(row.overallScore) }}>
            {row.overallScore}%
          </span>
        ) : (
          <span className={styles.scorePlaceholder}>--</span>
        ),
    }),
    createTableColumn<DAGridRow>({
      columnId: 'lastReviewed',
      compare: (a, b) => (a.reviewedOn?.getTime() ?? 0) - (b.reviewedOn?.getTime() ?? 0),
      renderHeaderCell: () => 'Last Reviewed',
      renderCell: (row) => <Text size={200}>{formatRelativeReviewDate(row.reviewedOn)}</Text>,
    }),
    createTableColumn<DAGridRow>({
      columnId: 'source',
      renderHeaderCell: () => 'Source',
      renderCell: () => (
        <Badge appearance="tint" color="brand">ZIP</Badge>
      ),
    }),
    createTableColumn<DAGridRow>({
      columnId: 'publisher',
      compare: (a, b) => (a.publisherName ?? '').localeCompare(b.publisherName ?? ''),
      renderHeaderCell: () => 'Publisher',
      renderCell: (row) => (
        <Text size={200} style={{ color: row.publisherName ? undefined : tokens.colorNeutralForeground4 }}>
          {row.publisherName || '—'}
        </Text>
      ),
    }),
    createTableColumn<DAGridRow>({
      columnId: 'review',
      renderHeaderCell: () => 'Review',
      renderCell: (row) => (
        <Button
          size="medium"
          icon={<BotSparkle24Color aria-hidden="true" />}
          onClick={() => onReview(row)}
          className={styles.reviewButton}
          aria-label={`Review ${row.agentName}`}
        >
          Review
        </Button>
      ),
    }),
    createTableColumn<DAGridRow>({
      columnId: 'view',
      renderHeaderCell: () => 'Details',
      renderCell: (row) => (
        <Button
          size="medium"
          icon={<Eye20Regular />}
          onClick={() => onViewResults(row)}
          disabled={row.action !== 'view-results'}
          className={styles.viewButton}
          aria-label={`View results for ${row.agentName}`}
        >
          View
        </Button>
      ),
    }),
  ];

  if (isLoading) {
    return (
      <Skeleton aria-label="Loading agents">
        <div className={styles.skeletonHeaderRow}>
          <SkeletonItem className={styles.skeletonName} />
          <SkeletonItem className={styles.skeletonSmall} />
          <SkeletonItem className={styles.skeletonMedium} />
          <SkeletonItem className={styles.skeletonButton} />
          <SkeletonItem className={styles.skeletonButton} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <SkeletonItem className={styles.skeletonName} />
            <SkeletonItem className={styles.skeletonSmall} />
            <SkeletonItem className={styles.skeletonMedium} />
            <SkeletonItem className={styles.skeletonButton} />
            <SkeletonItem className={styles.skeletonButton} />
          </div>
        ))}
      </Skeleton>
    );
  }

  if (rows.length === 0) {
    return (
      <Card appearance="subtle" className={styles.emptyCard}>
        <div className={styles.emptyTitleRow}>
          <Agents28Color className={styles.emptyIcon} aria-hidden="true" />
          <Text size={400} weight="semibold">No agents reviewed yet</Text>
        </div>
        <Text size={300} block className={styles.emptyDescText}>
          Upload a DA package ZIP to review your agent.
        </Text>
        <div className={styles.emptyActions}>
          <Button appearance="primary" icon={<FolderZipRegular />} onClick={onUploadZip}>
            Review from ZIP
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <DataGrid
      items={rows}
      columns={columns}
      sortable
      resizableColumns
      className={styles.grid}
      columnSizingOptions={columnSizingOptions}
      aria-label="Declarative Agent reviews"
      getRowId={(row) => row.componentIdUnique}
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell }) => (
            <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
          )}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<DAGridRow>>
        {({ item, rowId }) => (
          <DataGridRow<DAGridRow>
            key={rowId}
            style={{ height: '60px' }}
            onMouseEnter={() => setHoveredRowId(item.componentIdUnique)}
            onMouseLeave={() => setHoveredRowId(null)}
          >
            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
  );
}
