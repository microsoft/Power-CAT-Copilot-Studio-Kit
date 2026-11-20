import type { Cat_agentusagehistories } from '../../../generated/models/Cat_agentusagehistoriesModel';
import { Cat_agentusagehistoriesService } from '../../../generated/services/Cat_agentusagehistoriesService';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import type { AgentInventoryRecord, AgentUsageRecord } from '../contracts/types';

const SELECT: string[] = [
  'cat_agentusagehistoryid', 'cat_name', 'cat_agentid', '_cat_agent_value', 'cat_environmentid',
  'cat_featurename', 'cat_usagedate', 'cat_fromdate', 'cat_todate',
  'cat_billedcopilotcredits', 'cat_nonbilledcopilotcredits', 'cat_users',
  'cat_toolinvoked', 'cat_knowledgesources', 'cat_llmmodel', 'cat_channelid', 'cat_refreshstatus',
];

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDomain(row: Cat_agentusagehistories): AgentUsageRecord {
  return {
    id: row.cat_agentusagehistoryid,
    sourceName: row.cat_name,
    agentDetailsId: row._cat_agent_value,
    agentId: row.cat_agentid,
    environmentId: row.cat_environmentid,
    featureName: row.cat_featurename,
    usageDate: row.cat_usagedate,
    fromDate: row.cat_fromdate,
    toDate: row.cat_todate,
    billedCredits: numberValue(row.cat_billedcopilotcredits),
    nonBilledCredits: numberValue(row.cat_nonbilledcopilotcredits),
    users: numberValue(row.cat_users),
    toolInvoked: row.cat_toolinvoked,
    knowledgeSources: row.cat_knowledgesources,
    llmModel: row.cat_llmmodel,
    channelId: row.cat_channelid,
    refreshStatus: row.cat_refreshstatus,
  };
}

function dateFilter(startDate: Date): string {
  return `cat_usagedate ge ${startDate.toISOString()}`;
}

export class AgentInventoryUsageService {
  /** Fetch usage records on or after the supplied date. */
  static async listSince(startDate: Date): Promise<AgentUsageRecord[]> {
    const rows = await paginatedFetchAll<Cat_agentusagehistories>(
      (options) => Cat_agentusagehistoriesService.getAll(options),
      { select: SELECT, filter: dateFilter(startDate), orderBy: ['cat_usagedate asc'] },
    );
    return rows.map(toDomain);
  }

  /** Fetch all usage for one agent using the stable agent resource ID (no date filter). */
  static async listForAgent(agent: AgentInventoryRecord): Promise<AgentUsageRecord[]> {
    const safeAgentId = agent.agentId.replace(/'/g, "''");
    const filter = `cat_agentid eq '${safeAgentId}'`;
    const rows = await paginatedFetchAll<Cat_agentusagehistories>(
      (options) => Cat_agentusagehistoriesService.getAll(options),
      { select: SELECT, filter, orderBy: ['cat_usagedate asc'] },
    );
    return rows.map(toDomain);
  }
}
