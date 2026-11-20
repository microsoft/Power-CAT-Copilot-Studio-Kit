import { useState, useCallback, useEffect } from 'react';
import { checkInProgressConflict } from '../../../shared/services/dataverse/wizardSubmitService';

export interface ConflictResult {
  requestId: string;
  requestNumber: string;
}

export interface ConflictCheckState {
  conflict: ConflictResult | null;
  isChecking: boolean;
  recheck: () => Promise<void>;
}

/**
 * Checks whether the selected Service Tree already has an in-progress request
 * that would block a new submission.
 *
 * Runs automatically when `serviceTreeId` changes (skipped when undefined).
 * The `recheck` function can be called manually — e.g., as a race condition
 * guard immediately before the final wizard submit.
 *
 * @param serviceTreeId    The Dataverse GUID of the selected Service Tree.
 * @param excludeRequestId Optional request ID to exclude (used in draft-edit
 *                         mode to avoid conflicting with the draft being edited).
 */
export function useConflictCheck(
  serviceTreeId: string | undefined,
  excludeRequestId?: string,
): ConflictCheckState {
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const recheck = useCallback(async () => {
    if (!serviceTreeId) return;

    setIsChecking(true);
    try {
      const result = await checkInProgressConflict(serviceTreeId, excludeRequestId);
      setConflict(result);
    } finally {
      setIsChecking(false);
    }
  }, [serviceTreeId, excludeRequestId]);

  useEffect(() => {
    if (!serviceTreeId) return;
    void recheck();
  }, [serviceTreeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { conflict, isChecking, recheck };
}
