/**
 * Service wrapper for the cat_transcriptmetricses Dataverse table.
 * Provides typed access to transcript-level metrics.
 *
 * NOTE: This table uses cat_conversationdate (not cat_metricdate)
 * and cat_agentid (not cat_agentname).
 */
import { Cat_transcriptmetricsesService } from '../../../generated/services/Cat_transcriptmetricsesService';
import type { TranscriptMetrics } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof TranscriptMetrics)[] = [
  'cat_transcriptmetricsid',
  'cat_transcriptmetricname',
  'cat_agentid',
  'cat_agentname',
  'cat_conversationdate',
  'cat_channelid',
  'cat_datasourcecode',
  'cat_totalconversations',
  'cat_sessioncount',
  'cat_engagedcount',
  'cat_unengagedcount',
  'cat_resolvedcount',
  'cat_escalatedcount',
  'cat_abandonedcount',
  'cat_totalturns',
  'cat_csatcount',
  'cat_csatscore',
  'cat_feedbacklikecount',
  'cat_feedbackdislikecount',
  'cat_runs',
  'cat_successfulruns',
  'cat_averagedurationseconds',
  'cat_connectedagentdetails',
  '_cat_agentconfiguration_value',
];

export class TranscriptMetricsService {
  /** Fetch all transcript metrics, ordered by conversation date ascending. */
  static async getAll(filter?: string): Promise<TranscriptMetrics[]> {
    return paginatedFetchAll(
      (opts) => Cat_transcriptmetricsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_conversationdate asc'] },
    ) as Promise<TranscriptMetrics[]>;
  }

  static async hasAny(): Promise<boolean> {
    const result = await Cat_transcriptmetricsesService.getAll({ select: ['cat_transcriptmetricsid'], top: 1 });
    return (result.data?.length ?? 0) > 0;
  }
}
