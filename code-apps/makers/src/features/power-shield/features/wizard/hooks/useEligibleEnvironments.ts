import { useEffect, useRef } from 'react';
import { getEligibleEnvironments } from '../../../shared/services/dataverse/environmentService';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { PpEnvironment } from '../../../models/environment';

export interface EligibleEnvironmentsState {
  environments: PpEnvironment[];
  isLoading: boolean;
  error: string | null;
  /** Reloads the list (used by Retry). */
  refetch?: () => void;
}

/**
 * Fetches Power Platform environments accessible to the current user via the
 * powerappsforappmakers connector (Get-Environments operation).
 *
 * The API is already user-scoped — no secondary eligibility query needed.
 * Developer and non-Succeeded environments are filtered client-side in the service.
 *
 * @param initialData  If provided (from WizardContext cache), the API call is
 *                     skipped and this data is returned immediately.
 */
export function useEligibleEnvironments(initialData?: PpEnvironment[]): EligibleEnvironmentsState {
  const { notifyError } = useNotify();
  const initialDataRef = useRef(initialData);

  const { data, isLoading, error, refetch } = useFetch<PpEnvironment[]>(
    () => initialDataRef.current !== undefined
      ? Promise.resolve(initialDataRef.current)
      : getEligibleEnvironments(),
    [],
  );

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  return {
    environments: data ?? [],
    isLoading,
    error,
    refetch,
  };
}
