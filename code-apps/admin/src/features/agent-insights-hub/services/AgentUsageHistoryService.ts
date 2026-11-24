/**
 * Service wrapper for the cat_agentusagehistories Dataverse table.
 * Provides typed access to agent usage/credit history.
 *
 * Pagination: the Power Apps SDK caps each call at ~500 records, so we use
 * skipToken pagination to retrieve every record. Without this, only the
 * first page is loaded and downstream charts/tables show partial data.
 */
import { Cat_agentusagehistoriesService } from '../../../generated/services/Cat_agentusagehistoriesService';
import type { Cat_agentusagehistories } from '../../../generated/models/Cat_agentusagehistoriesModel';
import type { AgentUsageHistory } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof AgentUsageHistory)[] = [
  'cat_agentusagehistoryid',
  'cat_name',
  'cat_agentid',
  'cat_environmentid',
  'cat_featurename',
  'cat_usagedate',
  'cat_billedcopilotcredits',
  'cat_nonbilledcopilotcredits',
  '_cat_agent_value',
];

export class AgentUsageHistoryService {
  /** Fetch every usage history record, ordered by usage date descending. */
  static async getAll(): Promise<AgentUsageHistory[]> {
    const all = await paginatedFetchAll<Cat_agentusagehistories>(
      (opts) => Cat_agentusagehistoriesService.getAll(opts),
      { select: SELECT, orderBy: ['cat_usagedate desc'] },
    );
    return all as unknown as AgentUsageHistory[];
  }
}
