/**
 * useTranscriptStaging - Fetches transcript staging records.
 *
 * Accepts optional workflowStatus filter (independent from FilterContext).
 * Builds OData filter when status is not "all".
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { TranscriptStagingService } from '../services/TranscriptStagingService';
import type { TranscriptStaging } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';

/** Fetches transcript staging records with optional workflow status filter. */
export function useTranscriptStaging(workflowStatus = 'all') {
  const filter = workflowStatus !== 'all'
    ? `cat_workflowstatus eq ${workflowStatus}`
    : undefined;

  return useQuery<TranscriptStaging[]>({
    queryKey: queryKeys.transcriptStaging(workflowStatus),
    queryFn: () => TranscriptStagingService.getAll(filter),
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
