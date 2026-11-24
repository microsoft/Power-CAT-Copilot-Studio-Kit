import { useMemo, useState } from 'react';
import type {
  ReviewHistoryEntry,
  ReviewResult,
} from '../contracts/ReviewResult';
import {
  compareReviewsNewestFirst,
  getReviewFreshness,
} from '../utils/reviewHistory';

export type ReviewHistoryViewMode = 'list' | 'card';
export type ReviewHistorySortColumn =
  | 'agentVersion'
  | 'reviewedOn'
  | 'overallScore'
  | 'totalIssueCount'
  | 'highSeverityCount'
  | 'reviewKind'
  | 'freshness';

const DEFAULT_PAGE_SIZE = 5;

function compareOptional(
  left: string | number | undefined,
  right: string | number | undefined,
): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

/**
 * Owns the controlled search, sort, page, and view state shared by List/Cards.
 */
export function useReviewHistoryView(
  reviews: readonly ReviewResult[],
  currentPublishedOn?: Date | null,
) {
  const [view, setView] = useState<ReviewHistoryViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] =
    useState<ReviewHistorySortColumn>('reviewedOn');
  const [sortDirection, setSortDirection] =
    useState<'ascending' | 'descending'>('descending');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);

  const entries = useMemo<ReviewHistoryEntry[]>(() => {
    const withFreshness = reviews.flatMap((review) =>
      review.reviewId
        ? [{
            ...review,
            reviewId: review.reviewId,
            freshness: getReviewFreshness(
              review.agentVersion,
              currentPublishedOn,
              review.sourceEnvironment,
            ),
            versionNumber: 0, // placeholder, assigned below
          }]
        : [],
    );
    // Sort oldest-first to assign sequential version numbers (v1 = oldest)
    const chronological = [...withFreshness].sort(
      (a, b) => compareReviewsNewestFirst(b, a),
    );
    chronological.forEach((entry, index) => {
      entry.versionNumber = index + 1;
    });
    return withFreshness;
  },
    [currentPublishedOn, reviews],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return entries;
    return entries.filter((entry) => [
      entry.botName,
      entry.reviewKind ?? 'review type unknown',
      `v${entry.versionNumber}`,
      entry.freshness,
    ].some((value) => value?.toLocaleLowerCase().includes(term)));
  }, [entries, search]);

  const sorted = useMemo(() => {
    const result = [...filtered];
    result.sort((left, right) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'reviewedOn':
          comparison = compareReviewsNewestFirst(left, right);
          return sortDirection === 'descending' ? comparison : -comparison;
        case 'overallScore':
          comparison = compareOptional(left.overallScore, right.overallScore);
          break;
        case 'totalIssueCount':
          comparison = left.totalIssueCount - right.totalIssueCount;
          break;
        case 'highSeverityCount':
          comparison = left.highSeverityCount - right.highSeverityCount;
          break;
        case 'agentVersion':
          comparison = compareOptional(left.agentVersion, right.agentVersion);
          break;
        case 'reviewKind':
          comparison = compareOptional(left.reviewKind, right.reviewKind);
          break;
        case 'freshness':
          comparison = left.freshness.localeCompare(right.freshness);
          break;
      }
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    return result;
  }, [filtered, sortColumn, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  const pageEntries = useMemo(
    () => sorted.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [pageSize, safePage, sorted],
  );

  const selectSort = (column: ReviewHistorySortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) =>
        current === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'reviewedOn' ? 'descending' : 'ascending');
    }
    setPage(0);
  };

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(0);
  };

  const setSearchValue = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  return {
    view,
    setView,
    search,
    setSearch: setSearchValue,
    sortColumn,
    sortDirection,
    selectSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    totalCount: sorted.length,
    pageEntries,
  };
}
