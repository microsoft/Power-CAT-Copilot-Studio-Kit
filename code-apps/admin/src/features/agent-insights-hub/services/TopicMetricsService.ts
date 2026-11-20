/**
 * Service wrapper for the cat_topicmetricses Dataverse table.
 * Provides typed access to topic-level metrics.
 */
import { Cat_topicmetricsesService } from '../../../generated/services/Cat_topicmetricsesService';
import type { TopicMetrics } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof TopicMetrics)[] = [
  'cat_topicmetricsid',
  'cat_topicmetricsname',
  'cat_topicname',
  'cat_metricdate',
  'cat_agentname',
  'cat_channelid',
  'cat_datasourcecode',
  'cat_triggercount',
  'cat_completioncount',
  'cat_completionrate',
  'cat_abandonmentcount',
  'cat_abandonmentrate',
  'cat_redirectcount',
  'cat_errorcount',
  'cat_errorrate',
  'cat_dailyuniqueconversations',
  'cat_dailyuniqueusers',
  'cat_totaldurationms',
  'cat_durationcount',
  'cat_mediandurationms',
  'cat_mindurationms',
  'cat_maxdurationms',
  'cat_p95durationms',
  'cat_messagecount',
  'cat_messagesin',
  'cat_messagesout',
  'cat_actioncount',
  'cat_totalactionelapsedms',
  'cat_maxactionelapsedms',
  'cat_p90actionelapsedms',
  'cat_nodekindsdisplay',
  '_cat_agentconfiguration_value',
];

export class TopicMetricsService {
  /** Fetch all topic metrics, ordered by date ascending. */
  static async getAll(filter?: string): Promise<TopicMetrics[]> {
    return paginatedFetchAll(
      (opts) => Cat_topicmetricsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_metricdate asc'] },
    ) as Promise<TopicMetrics[]>;
  }

  static async hasAny(): Promise<boolean> {
    const result = await Cat_topicmetricsesService.getAll({ select: ['cat_topicmetricsid'], top: 1 });
    return (result.data?.length ?? 0) > 0;
  }
}
