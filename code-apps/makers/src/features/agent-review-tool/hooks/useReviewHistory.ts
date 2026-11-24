import { useQuery } from '@tanstack/react-query';
import type { ReviewHistorySubject } from '../contracts/ReviewResult';
import { reviewService } from '../services/ReviewService';
import { getReviewSubjectKey } from '../utils/reviewHistory';
import { queryKeys } from './queryKeys';

/**
 * Loads lightweight, newest-first history for one live or ZIP review subject.
 */
export function useReviewHistory(
  subject: ReviewHistorySubject | null,
) {
  const subjectKey = subject ? getReviewSubjectKey(subject) : '';
  return useQuery({
    queryKey: queryKeys.reviewHistory(
      subject?.sourceEnvironment,
      subjectKey,
    ),
    queryFn: () => reviewService.getReviewHistory(subject!),
    enabled: Boolean(subject?.botId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
