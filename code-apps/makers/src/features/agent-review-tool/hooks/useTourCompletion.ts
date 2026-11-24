/**
 * useTourCompletion Hook
 *
 * React Query mutation to mark welcome tour as completed in Dataverse.
 * Creates or updates record in cat_agentreviewfre table.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { Cat_agentreviewfresService } from '../../../generated/services/Cat_agentreviewfresService';

/**
 * Input for tour completion mutation
 */
export interface TourCompletionInput {
  /** User ID completing the tour */
  userId: string;
  /** Whether tour was completed or skipped */
  completed: boolean;
}

/**
 * useTourCompletion Hook
 *
 * Marks the welcome tour as completed for the current user.
 * Creates or updates the cat_agentreviewfre record.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const tourCompletion = useTourCompletion();
 *
 * const handleFinishTour = async () => {
 *   try {
 *     await tourCompletion.mutateAsync({
 *       userId: currentUserId,
 *       completed: true,
 *     });
 *     showToast('Tour completed!');
 *   } catch (error) {
 *     showToast('Failed to save tour status');
 *   }
 * };
 * ```
 */
export function useTourCompletion() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, TourCompletionInput>({
    mutationFn: async (input: TourCompletionInput) => {
      try {
        // Check if record already exists for this user
        const filter = `_cat_user_value eq '${input.userId}'`;
        const existingRecords = await Cat_agentreviewfresService.getAll({
          filter,
          top: 1,
        });

        const now = new Date().toISOString();

        const records = existingRecords.success && existingRecords.data ? existingRecords.data : [];

        if (records.length > 0) {
          // Update existing record
          const recordId = records[0].cat_agentreviewfreid;
          if (!recordId) {
            throw new Error('Existing tour record has no ID');
          }
          await Cat_agentreviewfresService.update(recordId, {
            cat_completed: input.completed ? 1 : 0, // 1 = Yes, 0 = No
            cat_completeddate: now,
          });
        } else {
          // Create new record
          // Note: User lookup field requires odata.bind format
          await Cat_agentreviewfresService.create({
            'cat_User@odata.bind': `/systemusers(${input.userId})`,
            cat_completed: input.completed ? 1 : 0, // 1 = Yes, 0 = No
            cat_completeddate: now,
            cat_name: `Tour Status`, // Required name field
            ownerid: input.userId,
            owneridtype: 'systemusers',
            statecode: 0, // Active
          });
        }
      } catch (error) {
        console.error('Failed to save tour completion status:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Failed to save tour completion status'
        );
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate tour status query to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.tourStatus(variables.userId),
      });
    },
  });
}
