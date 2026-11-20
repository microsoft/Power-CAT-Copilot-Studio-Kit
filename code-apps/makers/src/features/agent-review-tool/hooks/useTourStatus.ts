/**
 * useTourStatus Hook
 *
 * React Query hook to fetch welcome tour completion status from Dataverse.
 * Uses cat_agentreviewfre table to track if user has completed the tour.
 *
 * Query Key: ['tour-status', userId]
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { Cat_agentreviewfresService } from '../../../generated/services/Cat_agentreviewfresService';

/**
 * Tour status from Dataverse
 */
export interface TourStatus {
  /** Tour completed flag — false means first-time user or error */
  tourCompleted: boolean;
  /** User ID who completed the tour (undefined if never completed) */
  userId?: string;
  /** Completion timestamp (undefined if never completed) */
  completedOn?: Date;
}

/**
 * useTourStatus Hook
 *
 * Fetches tour completion status for the current user.
 * Returns undefined if user has never seen the tour (first visit).
 *
 * @param userId - Current user ID
 * @returns Query result with tour status
 *
 * @example
 * ```tsx
 * const { data: tourStatus, isLoading } = useTourStatus(currentUserId);
 *
 * if (isLoading) return <Spinner />;
 * if (!tourStatus?.tourCompleted) {
 *   return <WelcomeTour ... />;
 * }
 * ```
 */
export function useTourStatus(userId: string) {
  return useQuery<TourStatus, Error>({
    queryKey: queryKeys.tourStatus(userId),
    enabled: !!userId,
    queryFn: async () => {
      try {
        // Query cat_agentreviewfre table for user's tour status
        // Filter: _cat_user_value eq '{userId}'
        const filter = `_cat_user_value eq '${userId}'`;

        const result = await Cat_agentreviewfresService.getAll({
          filter,
          top: 1,
        });

        // IOperationResult<T[]> structure - unwrap .data
        if (!result.success || !result.data || result.data.length === 0) {
          return { tourCompleted: false };
        }

        const record = result.data[0];

        return {
          tourCompleted: record.cat_completed === 1, // 1 = Yes, 0 = No
          userId: record._cat_user_value,
          completedOn: record.cat_completeddate
            ? new Date(record.cat_completeddate)
            : undefined,
        };
      } catch (error) {
        console.error('Failed to fetch tour status:', error);
        return { tourCompleted: false };
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour - tour status rarely changes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: 1, // Only retry once on failure
  });
}
