import { useEffect } from 'react';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';
import { getConnectorActions } from '../../../shared/services/dataverse/connectorActionsService';
import type { ConnectorAction } from '../../../models/connectorAction';

interface ConnectorActionsState {
  actions: ConnectorAction[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches connector actions for a given connector.
 * When connectorId is null no fetch is made and the hook returns an empty list.
 */
export function useConnectorActions(connectorId: string | null): ConnectorActionsState {
  const { notifyError } = useNotify();

  const { data, isLoading, error } = useFetch<ConnectorAction[]>(
    () => (connectorId ? getConnectorActions(connectorId) : Promise.resolve([])),
    [connectorId],
  );

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  return {
    actions: data ?? [],
    // Only show loading state when there is actually a pending fetch
    isLoading: !!connectorId && isLoading,
    error,
  };
}
