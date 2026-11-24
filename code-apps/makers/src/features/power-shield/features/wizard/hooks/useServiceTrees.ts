import { useCallback, useEffect, useState } from 'react';
import { getServiceTreesForUser } from '../../../shared/services/dataverse/serviceTreeService';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { ServiceTree } from '../../../models/serviceTree';

export function useServiceTrees(dvUserId: string): {
  serviceTrees: ServiceTree[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { notifyError } = useNotify();
  const [serviceTrees, setServiceTrees] = useState<ServiceTree[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getServiceTreesForUser(dvUserId);
      setServiceTrees(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service trees.');
    } finally {
      setIsLoading(false);
    }
  }, [dvUserId]);

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  // Auto-load on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { serviceTrees, isLoading, error, refresh };
}
