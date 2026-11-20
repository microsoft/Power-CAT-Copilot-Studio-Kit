import { useEffect, useRef, useState } from 'react';
import { useCreditWizard } from '../wizard/contexts/CreditWizardContext';
import type { CreditDraftRevalidation } from '../wizard/contexts/creditWizardTypes';
import type { EligibleEnvironmentsState } from '../../wizard/hooks/useEligibleEnvironments';
import { useNotify } from '../../../shared/hooks/useNotify';
import { loadCreditDraft, normalizeEnvKey } from '../../../shared/services/dataverse/creditRequestService';
import type { CreditWizardEnvironment } from '../../../models/creditRequest';

export type CreditDraftResumeStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * Hydrates the credit wizard from a saved draft (spec 028). Waits until the
 * eligible environment list has loaded without error, then keeps only the saved
 * environments the maker can still access. Removed ones are listed so the maker
 * must confirm before continuing; if none are left the draft is `invalidAccess`.
 * A wrong-type id is surfaced as `isWrongType` (the route shows the not-found).
 *
 * Runs once per draft id. A failed load can run again after the eligible list
 * reloads (for example after Retry).
 */
export function useCreditDraftResume(
  draftRequestId: string | undefined,
  eligibleState: EligibleEnvironmentsState,
): {
  status: CreditDraftResumeStatus;
  isWrongType: boolean;
} {
  const { dispatch } = useCreditWizard();
  const { notifyError } = useNotify();
  const { environments: eligible, isLoading: eligibleLoading, error: eligibleError } = eligibleState;

  const [status, setStatus] = useState<CreditDraftResumeStatus>(draftRequestId ? 'loading' : 'idle');
  const [isWrongType, setIsWrongType] = useState(false);
  const ranForRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Never judge access against a list that failed to load.
    if (!draftRequestId || eligibleLoading || eligibleError) return;
    if (ranForRef.current === draftRequestId) return;
    ranForRef.current = draftRequestId;
    setStatus('loading');

    void (async () => {
      try {
        // A PpEnvironment's `name` is the environment GUID.
        const eligibleEnvs: CreditWizardEnvironment[] = eligible.map((e) => ({
          environmentId: e.name,
          displayName: e.displayName,
        }));
        const { detail, envDiff } = await loadCreditDraft(draftRequestId, eligibleEnvs);

        const eligibleByKey = new Map(eligibleEnvs.map((e) => [normalizeEnvKey(e.environmentId), e]));
        const accessible = detail.environments
          .map((saved) => ({ saved, env: eligibleByKey.get(normalizeEnvKey(saved.environmentGuid)) }))
          .filter((x): x is { saved: typeof x.saved; env: CreditWizardEnvironment } => !!x.env);

        const hasRemoved = envDiff.removed.length > 0;
        const revalidation: CreditDraftRevalidation =
          detail.environments.length > 0 && accessible.length === 0
            ? 'invalidAccess'
            : hasRemoved
              ? 'changed'
              : 'unchanged';

        dispatch({
          type: 'LOAD_DRAFT',
          payload: {
            draftRequestId,
            // Only environments the maker can still access, so hidden rows never
            // reach the count, the conflict check or submit.
            selectedEnvironments: accessible.map((x) => x.env),
            justification: detail.justification,
            requestedAmounts: Object.fromEntries(
              accessible
                .filter((x) => x.saved.requestedAmount !== undefined)
                .map((x) => [x.env.environmentId, String(x.saved.requestedAmount)]),
            ),
            requestTenantDraw: Object.fromEntries(
              accessible
                .filter((x) => x.saved.requestTenantDraw)
                .map((x) => [x.env.environmentId, true]),
            ),
            envDiff: hasRemoved && revalidation === 'changed' ? envDiff : null,
            draftRevalidation: revalidation,
          },
        });
        setStatus('done');
      } catch (err) {
        ranForRef.current = undefined;
        const message = err instanceof Error ? err.message : 'Failed to load the draft.';
        const wrongType = /not available in the copilot credits/i.test(message);
        setIsWrongType(wrongType);
        setStatus('error');
        if (!wrongType) notifyError(message);
      }
    })();
  }, [draftRequestId, eligibleLoading, eligibleError, eligible, dispatch, notifyError]);

  return { status, isWrongType };
}
