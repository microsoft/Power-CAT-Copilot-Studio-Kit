import { useCallback, useEffect, useRef, useState } from 'react';
import { getContainersByServiceTree } from '../../../shared/services/dataverse/environmentGroupService';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { EnvironmentGroup } from '../../../models/environmentGroup';

export function useContainersByServiceTree(serviceTreeId?: string): {
  containers: EnvironmentGroup[];
  isLoading: boolean;
  error: string | null;
  loadedForTreeId: string | undefined;
  refresh: (overrideTreeId?: string) => Promise<void>;
} {
  const { notifyError } = useNotify();
  const [containers, setContainers] = useState<EnvironmentGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedForTreeId, setLoadedForTreeId] = useState<string | undefined>(undefined);
  // Monotonic token so a slow fetch for a previous tree can never overwrite the
  // containers of the tree that is currently selected.
  const requestTokenRef = useRef(0);

  const refresh = useCallback(async (overrideTreeId?: string) => {
    // Allow callers to pass a tree id explicitly: when a refresh is triggered in the same
    // tick as a service-tree change (e.g. right after creating a new tree), the memoized
    // closure still holds the previous serviceTreeId, so the override avoids a stale fetch.
    const treeId = overrideTreeId ?? serviceTreeId;
    const token = ++requestTokenRef.current;
    if (!treeId) {
      setContainers([]);
      setLoadedForTreeId(undefined);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getContainersByServiceTree(treeId);
      if (token !== requestTokenRef.current) return; // superseded by a newer tree — discard
      setContainers(data);
      setLoadedForTreeId(treeId);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load environment containers.');
    } finally {
      if (token === requestTokenRef.current) setIsLoading(false);
    }
  }, [serviceTreeId]);

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { containers, isLoading, error, loadedForTreeId, refresh };
}
