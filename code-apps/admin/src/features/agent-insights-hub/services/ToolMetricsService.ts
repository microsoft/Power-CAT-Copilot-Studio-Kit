/**
 * Service wrapper for the cat_toolmetricses Dataverse table.
 * Provides typed access to tool-level metrics.
 */
import { Cat_toolmetricsesService } from '../../../generated/services/Cat_toolmetricsesService';
import type { ToolMetrics } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof ToolMetrics)[] = [
  'cat_toolmetricsid',
  'cat_toolmetricsname',
  'cat_toolname',
  'cat_tooltype',
  'cat_metricdate',
  'cat_agentname',
  'cat_channelid',
  'cat_datasourcecode',
  'cat_callcount',
  'cat_successcount',
  'cat_successrate',
  'cat_failurecount',
  'cat_failurerate',
  'cat_avgresponsetimems',
  'cat_minresponsetimems',
  'cat_maxresponsetimems',
  'cat_medianresponsetimems',
  'cat_p90responsetimems',
  'cat_p95responsetimems',
  'cat_p99responsetimems',
  'cat_stddevresponsetimems',
  'cat_uniqueconversations',
  'cat_firstcall',
  'cat_lastcall',
  'cat_errorcodes',
  'cat_resultcodes',
  '_cat_agentconfiguration_value',
];

export class ToolMetricsService {
  /** Fetch all tool metrics, ordered by date ascending. */
  static async getAll(filter?: string): Promise<ToolMetrics[]> {
    return paginatedFetchAll(
      (opts) => Cat_toolmetricsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_metricdate asc'] },
    ) as Promise<ToolMetrics[]>;
  }

  static async hasAny(): Promise<boolean> {
    const result = await Cat_toolmetricsesService.getAll({ select: ['cat_toolmetricsid'], top: 1 });
    return (result.data?.length ?? 0) > 0;
  }
}
