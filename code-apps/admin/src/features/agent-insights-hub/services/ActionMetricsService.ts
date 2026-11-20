/**
 * Service wrapper for the cat_actionmetricses Dataverse table.
 * Provides typed access to action-level metrics.
 */
import { Cat_actionmetricsesService } from '../../../generated/services/Cat_actionmetricsesService';
import type { ActionMetrics } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof ActionMetrics)[] = [
  'cat_actionmetricsid',
  'cat_actionmetricsname',
  'cat_nodekind',
  'cat_actionid',
  'cat_topicid',
  'cat_metricdate',
  'cat_agentname',
  'cat_channelid',
  'cat_datasourcecode',
  'cat_executioncount',
  'cat_dailyconversationcount',
  'cat_totalelapsedms',
  'cat_avgelapsedms',
  'cat_minelapsedms',
  'cat_maxelapsedms',
  'cat_p10elapsedms',
  'cat_p50elapsedms',
  'cat_p90elapsedms',
  'cat_p95elapsedms',
  'cat_p99elapsedms',
  'cat_stddevelapsedms',
  '_cat_agentconfiguration_value',
];

export class ActionMetricsService {
  /** Fetch all action metrics, ordered by date ascending. */
  static async getAll(filter?: string): Promise<ActionMetrics[]> {
    return paginatedFetchAll(
      (opts) => Cat_actionmetricsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_metricdate asc'] },
    ) as Promise<ActionMetrics[]>;
  }

  static async hasAny(): Promise<boolean> {
    const result = await Cat_actionmetricsesService.getAll({ select: ['cat_actionmetricsid'], top: 1 });
    return (result.data?.length ?? 0) > 0;
  }
}
