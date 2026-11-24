import type {
  ReviewFreshness,
  ReviewHistoryEntry,
} from '../../contracts/ReviewResult';

export function reviewVersionLabel(entry: ReviewHistoryEntry): string {
  return `v${entry.versionNumber}`;
}

export function reviewTypeLabel(entry: ReviewHistoryEntry): string {
  if (entry.reviewKind === 'standard') return 'Standard';
  if (entry.reviewKind === 'copilot') return 'Microsoft Copilot';
  return 'Review type unknown';
}

/** Display the mapped score state without asserting a score for an unassessed review. */
export function reviewScoreLabel(entry: ReviewHistoryEntry): string {
  if (entry.scoreState === 'not-assessed') return 'Not assessed';
  if (entry.scoreState === 'not-applicable') return 'N/A';
  if (entry.overallScoreApplicable === false) return 'Not assessed';
  return `${entry.overallScore}%`;
}

export function freshnessLabel(freshness: ReviewFreshness): string {
  switch (freshness) {
    case 'current':
      return 'Current';
    case 'stale':
      return 'Outdated';
    case 'not-published':
      return 'Publication unavailable';
    case 'version-unknown':
      return 'Reviewed';
  }
}
