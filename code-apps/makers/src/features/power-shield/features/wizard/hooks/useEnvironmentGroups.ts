import { useCallback, useEffect, useState } from 'react';
import { getMyGroups } from '../../../shared/services/dataverse/environmentGroupService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { EnvironmentGroup } from '../../../models/environmentGroup';

export function useEnvironmentGroups(): {
  groups: EnvironmentGroup[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { aadObjectId } = useAuth();
  const { notifyError } = useNotify();
  const [groups, setGroups] = useState<EnvironmentGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyGroups(aadObjectId);
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environment groups.');
    } finally {
      setIsLoading(false);
    }
  }, [aadObjectId]);

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  // Auto-load on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { groups, isLoading, error, refresh };
}
