import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreditChildState } from '../../../models/status';
import { sessionAttempts } from '../services/creditApprovalCommand';
import { runRecovery, startFreshReview, type RecoveryResult } from '../services/creditRecoveryCommand';
import { needsRecovery } from '../services/creditApprovalRules';
import { useApprovalDeps } from './useCreditApprovalSubmit';

interface RecoveryRow {
  childState?: CreditChildState;
  attemptId?: string;
  /** True while the request is Under review. A Succeeded row then still needs its approval finished. */
  underReview?: boolean;
}

export interface CreditRecoveryState {
  isRecovering: boolean;
  result?: RecoveryResult;
  retry(): void;
  /** Marks a conflicting attempt Superseded so Approve and Reject come back. */
  startFresh(): void;
  isResetting: boolean;
  resetError?: string;
}

/**
 * Resolves an unclear or orphaned allocation attempt when the detail page loads (FR-020, FR-020a).
 * Runs once per (request, attempt, state) key, so StrictMode's double effect does nothing extra.
 * Never calls PUT. Calls `onSettled` afterwards so the page reloads in the background.
 */
export function useCreditRecovery(
  requestId: string,
  row: RecoveryRow | undefined,
  onSettled: () => void,
): CreditRecoveryState {
  const deps = useApprovalDeps();
  const [nonce, setNonce] = useState(0);
  const [outcome, setOutcome] = useState<{ key: string; result: RecoveryResult }>();
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string>();
  const lastKeyRef = useRef<string | undefined>(undefined);
  const settledRef = useRef(onSettled);

  useEffect(() => {
    settledRef.current = onSettled;
  }, [onSettled]);

  const headerPending = row?.childState === 'Succeeded' && !!row.underReview;
  const needed =
    !!requestId && (headerPending || needsRecovery(row?.childState, row?.attemptId, sessionAttempts));
  const key = `${requestId}|${row?.attemptId ?? ''}|${row?.childState ?? ''}|${nonce}`;

  useEffect(() => {
    if (!needed || lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    // No cancel on cleanup: StrictMode's re-run is skipped by the key ref, so this run must report back.
    void runRecovery(deps, requestId).then((result) => {
      setOutcome({ key, result });
      if (result.kind !== 'Busy' && result.kind !== 'NotNeeded') settledRef.current();
    });
  }, [needed, key, deps, requestId]);

  const retry = useCallback(() => {
    setResetError(undefined);
    setNonce((n) => n + 1);
  }, []);

  const startFresh = useCallback(() => {
    setIsResetting(true);
    setResetError(undefined);
    void startFreshReview(deps, requestId)
      .then((r) => {
        if (r.kind === 'Reset') settledRef.current();
        else if (r.kind === 'Busy') setResetError('Something else is still running on this request. Try again in a moment.');
        else setResetError(r.message);
      })
      .finally(() => setIsResetting(false));
  }, [deps, requestId]);

  return {
    isRecovering: needed && outcome?.key !== key,
    result: outcome?.key.startsWith(`${requestId}|`) ? outcome.result : undefined,
    retry,
    startFresh,
    isResetting,
    resetError,
  };
}
