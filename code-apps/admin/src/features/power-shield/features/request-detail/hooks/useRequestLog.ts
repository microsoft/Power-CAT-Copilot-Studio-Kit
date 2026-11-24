import { useState, useCallback, useEffect } from 'react';
import { Cat_powershieldpolicyrequestlogsService } from '../../../../../generated/services/Cat_powershieldpolicyrequestlogsService';
import type { Cat_powershieldpolicyrequestlogs } from '../../../../../generated/models/Cat_powershieldpolicyrequestlogsModel';

export type RequestLogEntry = Pick<
  Cat_powershieldpolicyrequestlogs,
  | 'cat_powershieldpolicyrequestlogid'
  | 'cat_eventtype'
  | 'cat_loglevel'
  | 'cat_message'
  | 'cat_affectedpolicyid'
  | 'cat_affectedpolicyname'
  | 'createdon'
>;

export interface UseRequestLogResult {
  logs: RequestLogEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRequestLog(requestId: string): UseRequestLogResult {
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await Cat_powershieldpolicyrequestlogsService.getAll({
        filter: `_cat_policyrequest_value eq ${requestId}`,
        select: [
          'cat_powershieldpolicyrequestlogid',
          'cat_eventtype',
          'cat_loglevel',
          'cat_message',
          'cat_affectedpolicyid',
          'cat_affectedpolicyname',
          'createdon',
        ],
        orderBy: ['createdon asc'],
      });
      setLogs((result.data ?? []) as RequestLogEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity log.');
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return { logs, isLoading, error, refresh: fetchLogs };
}
