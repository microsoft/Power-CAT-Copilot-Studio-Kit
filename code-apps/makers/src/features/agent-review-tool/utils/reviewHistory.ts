import type {
  ReviewFreshness,
  ReviewHistorySubject,
  ReviewResult,
} from '../contracts/ReviewResult';

function dateValue(value: Date | string | undefined): number {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Builds the stable identity used by history queries and cache keys.
 */
export function getReviewSubjectKey(subject: ReviewHistorySubject): string {
  if (subject.sourceEnvironment === 'zip') {
    return `zip:${subject.componentIdUnique || subject.botId}`;
  }
  return `${subject.sourceEnvironment ?? ''}:bot:${subject.botId}`;
}

/**
 * Orders reviews newest first with deterministic Dataverse tie-breakers.
 */
export function compareReviewsNewestFirst(
  left: ReviewResult,
  right: ReviewResult,
): number {
  const reviewedDifference =
    dateValue(right.reviewedOn) - dateValue(left.reviewedOn);
  if (reviewedDifference !== 0) return reviewedDifference;

  const createdDifference =
    dateValue(right.createdOn) - dateValue(left.createdOn);
  if (createdDifference !== 0) return createdDifference;

  return (right.reviewId ?? '').localeCompare(left.reviewId ?? '');
}

/**
 * Returns a stable newest-first copy without mutating query data.
 */
export function sortReviewsNewestFirst(
  reviews: readonly ReviewResult[],
): ReviewResult[] {
  return [...reviews].sort(compareReviewsNewestFirst);
}

/**
 * Keeps the newest visible result for every live or ZIP review subject.
 */
export function selectLatestReviews(
  reviews: readonly ReviewResult[],
): ReviewResult[] {
  const latestBySubject = new Map<string, ReviewResult>();
  for (const review of sortReviewsNewestFirst(reviews)) {
    const key = getReviewSubjectKey({
      botId: review.botId,
      componentIdUnique: review.componentIdUnique,
      sourceEnvironment: review.sourceEnvironment,
    });
    if (!latestBySubject.has(key)) latestBySubject.set(key, review);
  }
  return Array.from(latestBySubject.values());
}

/**
 * Compares a stored review publication with the current live publication.
 */
export function getReviewFreshness(
  agentVersion: string | undefined,
  currentPublishedOn: Date | null | undefined,
  sourceEnvironment?: string,
): ReviewFreshness {
  if (!agentVersion || sourceEnvironment === 'zip') return 'version-unknown';
  if (!currentPublishedOn) return 'not-published';

  const reviewedPublication = Date.parse(agentVersion);
  const currentPublication = currentPublishedOn.getTime();
  if (!Number.isFinite(reviewedPublication) || !Number.isFinite(currentPublication)) {
    return 'version-unknown';
  }

  return currentPublication > reviewedPublication ? 'stale' : 'current';
}
