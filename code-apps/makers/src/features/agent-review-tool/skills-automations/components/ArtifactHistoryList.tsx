/**
 * The list of skill and automation reviews already run in this environment.
 *
 * The landing page of the other two tabs opens on what has been reviewed, and
 * this tab had nothing equivalent. The list is the tab's memory: a row reopens
 * the stored result rather than re-running the review, which is what stops a
 * team paying for the same AI review twice.
 *
 * Styled to match `DAGrid` on the declarative agents tab, which is itself
 * styled to match `BotsGrid` on the Copilot Studio tab. All three grids should
 * read as one product, so the shared conventions are kept deliberately: 60px
 * rows, a hover icon swap, a "new" marker for the last twelve hours, a large
 * colour-coded score, compact relative dates, a skeleton while loading and a
 * card rather than a bare table when there is nothing to show.
 */

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Text,
  Tooltip,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from '@fluentui/react-components';
import {
  ArrowSyncRegular,
  ArrowUploadRegular,
  DismissRegular,
  Eye20Regular,
  NewFilled,
  NewRegular,
  PuzzlePieceColor,
  PuzzlePieceRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import {
  ARTIFACT_KIND_LABELS,
  RECOMMENDATION_LABELS,
  type ArtifactRecommendation,
} from '../contracts/ArtifactReview';
import { RuntimeIconGroup } from './RuntimeIconGroup';
import { decideRecommendation } from '../services/artifactReviewService';
import type { StoredArtifactReview } from '../services/artifactReviewStore';
import { getScoreColor } from '../../utils/scoreCalculator';
import { hasScore, overallScoreOf } from '../services/artifactScore';
import { formatRelativeReviewDate, isRecentlyReviewed } from '../../utils/reviewGridFormat';

/**
 * What a row is describing.
 *
 * Most rows are an assessment. Two are not: a review that is still running, and
 * one that stopped before it produced a verdict. Both are stored so a review is
 * not lost when the browser closes, and both must be told apart from a real
 * result — a running row has no score, no runtime verdicts and a placeholder
 * recommendation, so rendering it like a finished review would invent a verdict
 * nothing has decided.
 */
type RowState = 'assessed' | 'running' | 'stopped';

function rowStateOf(item: StoredArtifactReview): RowState {
  if (item.result.status === 'in-progress') return 'running';
  if (item.result.status === 'failed') return 'stopped';
  return 'assessed';
}

/**
 * Recommendation colour.
 *
 * `keep-private` is the strongest outcome the rubric can return, so it takes
 * the danger appearance rather than a softer one.
 */
const RECOMMENDATION_APPEARANCE: Record<
  ArtifactRecommendation,
  'success' | 'warning' | 'danger'
> = {
  submit: 'success',
  revise: 'warning',
  'keep-private': 'danger',
};

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
  recommendationCell: {
    paddingRight: tokens.spacingHorizontalL,
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
    flexShrink: 0,
  },
  newIcon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: '-8px',
  },
  typeBadge: {
    // "Scout automation" is two words and wrapped inside the old column width.
    whiteSpace: 'nowrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
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
    // Matches the 28px the previous sized icon rendered at. The unsized colour
    // icon honours fontSize, so this has to be stated rather than inherited.
    fontSize: '28px',
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
  // Skeleton styles matching DAGrid exactly
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

/** `reviewedOn` comes from Dataverse; `reviewedAt` is what the review itself recorded. */
function reviewedDate(item: StoredArtifactReview): Date | undefined {
  if (item.reviewedOn) return item.reviewedOn;
  const parsed = new Date(item.result.reviewedAt);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function kindLabel(item: StoredArtifactReview): string {
  return item.result.artifactKind
    ? ARTIFACT_KIND_LABELS[item.result.artifactKind]
    : 'Not identified';
}

export interface ArtifactHistoryListProps {
  entries: StoredArtifactReview[];
  isLoading: boolean;
  /** Set when the list could not be read from the environment. */
  loadError: string | null;
  /** Receives the whole stored record, because opening a review needs its id. */
  onOpen: (entry: StoredArtifactReview) => void;
  onRetry: () => void;
  /** Starts a new review, from the empty state. */
  onUpload: () => void;
  /**
   * The term `entries` was filtered by, if any.
   *
   * An empty `entries` has two very different causes, and the caller is the only
   * one that can tell them apart: nothing has been reviewed, or a search hid
   * everything. Without this the tab told a reader with a full history that
   * they had reviewed nothing, and offered an upload button for a problem a
   * backspace would fix.
   */
  searchTerm?: string;
  /** Clears the search from the no-match state. Required when `searchTerm` is set. */
  onClearSearch?: () => void;
}

export function ArtifactHistoryList({
  entries,
  isLoading,
  loadError,
  onOpen,
  onRetry,
  onUpload,
  searchTerm = '',
  onClearSearch,
}: ArtifactHistoryListProps) {
  const styles = useStyles();
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  // Runtime fit must hold three logo-and-status pairs. It takes 20px from Last
  // Reviewed, whose short relative dates still fit, so the grid width is stable.
  const columnSizingOptions: TableColumnSizingOptions = {
    name: { defaultWidth: 360, minWidth: 180 },
    score: { defaultWidth: 90, minWidth: 70 },
    lastReviewed: { defaultWidth: 110, minWidth: 90 },
    type: { defaultWidth: 150, minWidth: 120 },
    runtimes: { defaultWidth: 150, minWidth: 120 },
    recommendation: { defaultWidth: 160, minWidth: 120 },
    view: { defaultWidth: 100, minWidth: 90 },
  };

  const columns: TableColumnDefinition<StoredArtifactReview>[] = useMemo(
    () => [
      createTableColumn<StoredArtifactReview>({
        columnId: 'name',
        compare: (a, b) => a.artifactName.localeCompare(b.artifactName),
        renderHeaderCell: () => <span className={styles.nameCellMedia}>Name</span>,
        renderCell: (item) => (
          <div className={styles.nameCellWrapper}>
            {hoveredRowId === item.reviewId ? (
              <PuzzlePieceColor className={styles.nameIcon} aria-hidden="true" />
            ) : (
              <PuzzlePieceRegular className={styles.nameIcon} aria-hidden="true" />
            )}
            <div className={styles.nameCell}>
              {isRecentlyReviewed(reviewedDate(item)) &&
                (hoveredRowId === item.reviewId ? (
                  <NewFilled className={styles.newIcon} fontSize={18} aria-label="Recently reviewed" />
                ) : (
                  <NewRegular className={styles.newIcon} fontSize={18} aria-label="Recently reviewed" />
                ))}
              {item.artifactName}
            </div>
          </div>
        ),
      }),
      createTableColumn<StoredArtifactReview>({
        columnId: 'score',
        compare: (a, b) => overallScoreOf(a.result) - overallScoreOf(b.result),
        renderHeaderCell: () => 'Score',
        renderCell: (item) => {
          const state = rowStateOf(item);

          if (state === 'running') {
            return (
              <Tooltip
                relationship="description"
                withArrow
                content="This review is still running. Its score appears here when it finishes."
              >
                <Badge appearance="tint" color="informative" tabIndex={0}>
                  Running
                </Badge>
              </Tooltip>
            );
          }

          if (state === 'stopped') {
            return (
              <Tooltip
                relationship="description"
                withArrow
                content={
                  item.result.error ??
                  'This review stopped before it produced a score. Review the file again to try once more.'
                }
              >
                <Badge appearance="tint" color="danger" tabIndex={0}>
                  Not finished
                </Badge>
              </Tooltip>
            );
          }

          const score = overallScoreOf(item.result);
          return hasScore(item.result) ? (
            <span className={styles.scoreText} style={{ color: getScoreColor(score) }}>
              {score}%
            </span>
          ) : (
            <span className={styles.scorePlaceholder}>--</span>
          );
        },
      }),
      createTableColumn<StoredArtifactReview>({
        columnId: 'lastReviewed',
        compare: (a, b) =>
          (reviewedDate(a)?.getTime() ?? 0) - (reviewedDate(b)?.getTime() ?? 0),
        renderHeaderCell: () => 'Last Reviewed',
        renderCell: (item) => {
          const state = rowStateOf(item);
          const when = formatRelativeReviewDate(reviewedDate(item));
          // "Reviewed 6 min ago" would be false for both of these: one has not
          // been reviewed yet, and the other never was.
          const prefix = state === 'running' ? 'Started ' : state === 'stopped' ? 'Stopped ' : '';
          return (
            <Text size={200}>
              {prefix}
              {when}
            </Text>
          );
        },
      }),
      createTableColumn<StoredArtifactReview>({
        columnId: 'type',
        compare: (a, b) => kindLabel(a).localeCompare(kindLabel(b)),
        renderHeaderCell: () => 'Type',
        renderCell: (item) => (
          <Badge appearance="tint" color="brand" className={styles.typeBadge}>
            {kindLabel(item)}
          </Badge>
        ),
      }),
      createTableColumn<StoredArtifactReview>({
        columnId: 'runtimes',
        renderHeaderCell: () => 'Runtimes',
        renderCell: (item) => {
          const hasEvaluatedVerdict = item.result.runtimeVerdicts.some(
            (verdict) => verdict.verdict !== 'not-evaluated',
          );
          const items = hasEvaluatedVerdict
            ? item.result.runtimeVerdicts
            : item.result.selectedRuntimes.map((runtime) => ({ runtime }));

          return items.length === 0 ? (
            <Text size={200} className={styles.muted}>
              Not evaluated
            </Text>
          ) : (
            <RuntimeIconGroup
              items={items}
              label={hasEvaluatedVerdict ? 'Runtime fit' : 'Selected runtimes'}
            />
          );
        },
      }),
      createTableColumn<StoredArtifactReview>({
        columnId: 'recommendation',
        compare: (a, b) => a.result.recommendation.localeCompare(b.result.recommendation),
        renderHeaderCell: () => 'Recommendation',
        renderCell: (item) => {
          // A running or stopped row carries a placeholder recommendation,
          // because the field is required and nothing has decided it. Showing
          // it would put a verdict on an artifact nobody has judged.
          if (rowStateOf(item) !== 'assessed') {
            return (
              <div className={styles.recommendationCell}>
                <Text size={200} className={styles.muted}>
                  Not decided
                </Text>
              </div>
            );
          }

          return (
            <div className={styles.recommendationCell}>
              <Tooltip
                relationship="description"
                // The specific reason, not the generic rule. A reader scanning
                // the grid asks "why this one?", and the rule alone lists
                // causes without saying which applied.
                content={
                  decideRecommendation(item.result.dimensions, item.result.runtimeVerdicts, item.result.findings)
                    .reason
                }
                withArrow
              >
                {/*
                  The badge is focusable so the explanation is not mouse-only.
                  A verdict the reader cannot question is worse than no verdict,
                  and hover is not available to a keyboard.
                */}
                <Badge
                  appearance="tint"
                  color={RECOMMENDATION_APPEARANCE[item.result.recommendation]}
                  tabIndex={0}
                >
                  {RECOMMENDATION_LABELS[item.result.recommendation]}
                </Badge>
              </Tooltip>
            </div>
          );
        },
      }),
      createTableColumn<StoredArtifactReview>({
        columnId: 'view',
        renderHeaderCell: () => 'Details',
        renderCell: (item) => {
          const state = rowStateOf(item);

          // There is nothing to open yet. The button is kept, disabled, rather
          // than removed: an empty cell reads as a rendering fault, and the
          // tooltip is where the reader finds out what to do instead.
          //
          // The running tooltip answers the question the disabled button
          // provokes — "do I have to sit here and wait?" — because the answer
          // changed: a review is now collected from its job whenever this list
          // is next opened, so leaving costs nothing.
          if (state !== 'assessed') {
            return (
              <Tooltip
                relationship="label"
                withArrow
                content={
                  state === 'running'
                    ? 'This review is still running. The results open here when it is ready, and closing the app will not lose them.'
                    : 'This review stopped before it produced results. Upload the file again to retry.'
                }
              >
                <Button
                  size="medium"
                  icon={<Eye20Regular />}
                  disabled
                  className={styles.viewButton}
                  aria-label={
                    state === 'running'
                      ? `Results for ${item.artifactName} are not ready yet`
                      : `Review of ${item.artifactName} did not finish`
                  }
                >
                  View
                </Button>
              </Tooltip>
            );
          }

          return (
            <Button
              size="medium"
              icon={<Eye20Regular />}
              onClick={() => onOpen(item)}
              className={styles.viewButton}
              aria-label={`View results for ${item.artifactName}`}
            >
              View
            </Button>
          );
        },
      }),
    ],
    [hoveredRowId, onOpen, styles],
  );

  if (isLoading) {
    return (
      <Skeleton aria-label="Loading past reviews">
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

  if (loadError) {
    return (
      <MessageBar intent="warning">
        <MessageBarBody>
          Past reviews could not be loaded, so this list may be incomplete. You can still review a
          file. {loadError}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" icon={<ArrowSyncRegular />} onClick={onRetry}>
            Try again
          </Button>
        </MessageBarActions>
      </MessageBar>
    );
  }

  if (entries.length === 0) {
    const term = searchTerm.trim();

    /*
      A search that matches nothing is not the same event as an empty history,
      so it does not get the same card. The upload button is deliberately absent:
      the reader's file is almost certainly already in the list, and starting a
      paid review is the wrong thing to make easy here.
    */
    if (term.length > 0) {
      return (
        <Card appearance="subtle" className={styles.emptyCard}>
          <div className={styles.emptyTitleRow}>
            <SearchRegular className={styles.emptyIcon} aria-hidden="true" />
            <Text size={400} weight="semibold">
              No reviews match your search
            </Text>
          </div>
          <Text size={300} block className={styles.emptyDescText}>
            Nothing in this list is named “{term}”. Check the spelling, or clear the search to see every
            review.
          </Text>
          <div className={styles.emptyActions}>
            <Button appearance="secondary" icon={<DismissRegular />} onClick={onClearSearch}>
              Clear search
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <Card appearance="subtle" className={styles.emptyCard}>
        <div className={styles.emptyTitleRow}>
          <PuzzlePieceColor className={styles.emptyIcon} aria-hidden="true" />
          <Text size={400} weight="semibold">
            No skills or automations reviewed yet
          </Text>
        </div>
        <Text size={300} block className={styles.emptyDescText}>
          Upload a skill or automation file to review it against Copilot Cowork, Scout and Copilot Studio.
        </Text>
        <div className={styles.emptyActions}>
          <Button appearance="primary" icon={<ArrowUploadRegular />} onClick={onUpload}>
            Review a skill or automation
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <DataGrid
        items={entries}
        columns={columns}
        sortable
        resizableColumns
        className={styles.grid}
        columnSizingOptions={columnSizingOptions}
        aria-label="Skill and automation reviews"
        getRowId={(item) => item.reviewId}
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<StoredArtifactReview>>
          {({ item, rowId }) => (
            <DataGridRow<StoredArtifactReview>
              key={rowId}
              style={{ height: '60px' }}
              onMouseEnter={() => setHoveredRowId(item.reviewId)}
              onMouseLeave={() => setHoveredRowId(null)}
            >
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </>
  );
}
