import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import {
  findOtherOpenRequest,
  readApprovalHeader,
  readApprovalRow,
} from '../../../shared/services/dataverse/creditApprovalRepository';
import {
  getAvailableCredits,
  getEnvironmentCredits,
  getEnvironmentGroup,
  getPaygInfo,
} from '../services/creditAllocationService';
import {
  getAllocateBlocks,
  getApprovalBlocks,
  getWarnings,
  type AllocateBlock,
  type ApprovalBlock,
  type ApprovalWarning,
  type ReviewSnapshot,
} from '../services/creditApprovalRules';

export interface CreditApprovalReview {
  /** Latest snapshot, or null before the first load and after a failed read. */
  review: ReviewSnapshot | null;
  blocks: ApprovalBlock[];
  allocateBlocks: AllocateBlock[];
  warnings: ApprovalWarning[];
  loadReview(): Promise<void>;
  isLoading: boolean;
  hasLoaded: boolean;
}

/** Loads everything the Review step needs (command contract "loadReview"). Stale responses are ignored. */
export function useCreditApprovalReview(requestId: string): CreditApprovalReview {
  const { dvUserId } = useAuth();
  const [review, setReview] = useState<ReviewSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const seqRef = useRef(0);

  const loadReview = useCallback(async () => {
    const seq = ++seqRef.current;
    setIsLoading(true);
    let next: ReviewSnapshot | null = null;
    try {
      const row = await readApprovalRow(requestId);
      const [header, other, credits, available, payg, group] = await Promise.all([
        readApprovalHeader(requestId),
        findOtherOpenRequest(row.envId, requestId),
        getEnvironmentCredits(row.envId),
        getAvailableCredits(),
        getPaygInfo(row.envId),
        getEnvironmentGroup(row.envId),
      ]);
      next = {
        envId: row.envId,
        current: credits.allocated,
        available,
        rules: credits.rules,
        rulesDefaulted: credits.rulesDefaulted,
        payg: payg.status,
        paygPolicyName: payg.policyName,
        group,
        otherOpenRequestId: other,
        headerOk: header.underReview && !!dvUserId && header.assigneeDvId === dvUserId.toLowerCase(),
        rowState: row.state,
        rowAttemptId: row.attemptId,
        requested: row.requested,
        requestedDraw: row.requestedDraw,
      };
    } catch {
      next = null;
    }
    if (seq !== seqRef.current) return;
    setReview(next);
    setHasLoaded(true);
    setIsLoading(false);
  }, [requestId, dvUserId]);

  const blocks = useMemo(() => (hasLoaded ? getApprovalBlocks(review) : []), [hasLoaded, review]);
  const allocateBlocks = useMemo(() => (review ? getAllocateBlocks(review) : []), [review]);
  const warnings = useMemo(() => (review ? getWarnings(review) : []), [review]);

  return { review, blocks, allocateBlocks, warnings, loadReview, isLoading, hasLoaded };
}
