import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import * as repo from '../../../shared/services/dataverse/creditApprovalRepository';
import { getEnvironmentCredits, getPaygInfo, setEnvironmentCredits } from '../services/creditAllocationService';
import {
  runApproval,
  type ApprovalDeps,
  type ApprovalResult,
  type SubmitInput,
} from '../services/creditApprovalCommand';
import type { ReviewSnapshot } from '../services/creditApprovalRules';

/** Wires the real services into the approval command. */
export function useApprovalDeps(): ApprovalDeps {
  const { dvUserId, aadObjectId } = useAuth();
  return useMemo(
    () => ({
      adminDvId: dvUserId ?? '',
      adminAadId: aadObjectId ?? '',
      credits: {
        getEnvironmentCredits,
        setEnvironmentCredits,
        getPaygStatus: (envId: string) => getPaygInfo(envId).then((p) => p.status),
      },
      repo,
    }),
    [dvUserId, aadObjectId],
  );
}

/**
 * Submits an approval. A ref blocks double clicks before React re-renders (SC-004).
 * The command is never aborted: closing the dialog or unmounting only skips the state update.
 */
export function useCreditApprovalSubmit(requestId: string): {
  submit(review: ReviewSnapshot, input: SubmitInput): Promise<ApprovalResult>;
  isWorking: boolean;
} {
  const deps = useApprovalDeps();
  const [isWorking, setIsWorking] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = useCallback(
    async (review: ReviewSnapshot, input: SubmitInput): Promise<ApprovalResult> => {
      if (inFlightRef.current) return { kind: 'Busy' };
      inFlightRef.current = true;
      setIsWorking(true);
      try {
        return await runApproval(deps, requestId, review, input);
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setIsWorking(false);
      }
    },
    [deps, requestId],
  );

  return { submit, isWorking };
}
