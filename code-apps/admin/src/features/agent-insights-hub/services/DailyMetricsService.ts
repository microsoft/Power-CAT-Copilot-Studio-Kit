/**
 * Service wrapper for the cat_dailymetricses Dataverse table.
 * Provides typed access to daily aggregated metrics.
 */
import { Cat_dailymetricsesService } from '../../../generated/services/Cat_dailymetricsesService';
import type { DailyMetrics } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof DailyMetrics)[] = [
  'cat_dailymetricsid',
  'cat_dailymetricsname',
  'cat_agentname',
  'cat_metricdate',
  'cat_channelid',
  'cat_datasourcecode',
  'cat_dailyconversationcount',
  'cat_dailyuniqueusers',
  'cat_dailyuniquetools',
  'cat_dailyuniquetopics',
  'cat_totalusermessages',
  'cat_totalresponses',
  'cat_totalresponsetimems',
  'cat_minresponsetimems',
  'cat_maxresponsetimems',
  'cat_p10responsetimems',
  'cat_p50responsetimems',
  'cat_p90responsetimems',
  'cat_p95responsetimems',
  'cat_p99responsetimems',
  'cat_stddevresponsetimems',
  'cat_slowresponses16s',
  'cat_totaldurationms',
  'cat_conversationcountforduration',
  'cat_mediandurationms',
  'cat_p95durationms',
  'cat_singleturnconversations',
  'cat_multiturnconversations',
  'cat_shortconversations',
  'cat_mediumconversations',
  'cat_longconversations',
  'cat_errorcount',
  'cat_toolcallcount',
  'cat_toolsuccesscount',
  'cat_toolfailurecount',
  'cat_totaltoolresponsetimems',
  'cat_maxtoolresponsetimems',
  'cat_p50toolresponsetimems',
  'cat_p95toolresponsetimems',
  'cat_topusersdisplay',
  '_cat_agentconfiguration_value',
];

export class DailyMetricsService {
  /** Fetch all daily metrics, ordered by date ascending. */
  static async getAll(filter?: string): Promise<DailyMetrics[]> {
    return paginatedFetchAll(
      (opts) => Cat_dailymetricsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_metricdate asc'] },
    ) as Promise<DailyMetrics[]>;
  }

  /** Lightweight check: does at least one record exist (no filter)? */
  static async hasAny(): Promise<boolean> {
    const result = await Cat_dailymetricsesService.getAll({
      select: ['cat_dailymetricsid'],
      top: 1,
    });
    return (result.data?.length ?? 0) > 0;
  }
}
