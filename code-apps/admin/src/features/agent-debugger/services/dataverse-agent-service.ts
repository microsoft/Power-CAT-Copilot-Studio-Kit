import { ensurePowerAppsInitialized } from "../utils/power-apps-init";

import type { Cat_agentdetailses } from "../../../generated/models/Cat_agentdetailsesModel";
import { Cat_agentdetailsesService } from "../../../generated/services/Cat_agentdetailsesService";

export interface AgentDetailsOption {
  id: string;
  name: string;
  botId?: string;
  environmentUrl?: string;
  environmentName?: string;
  environmentId?: string;
  createdBy?: string;
  createdDate?: string;
  isTranscriptAvailable?: boolean;
}

function toAgentDetailsOption(entity: Cat_agentdetailses): AgentDetailsOption {
  return {
    id: entity.cat_agentdetailsid,
    name: entity.cat_name ?? "",
    botId: entity.cat_agentid,
    environmentUrl: entity.cat_environmenturl ?? undefined,
    environmentName: entity.cat_environmentname ?? undefined,
    environmentId: entity.cat_environmentid ?? undefined,
    createdBy: entity.cat_agentcreatedby ?? undefined,
    createdDate: entity.createdon ?? undefined,
    isTranscriptAvailable: entity.cat_istranscriptavailablecode === 1,
  };
}

const AGENT_SELECT_COLUMNS: Array<keyof Cat_agentdetailses | string> = [
  "cat_agentdetailsid",
  "cat_name",
  "cat_agentid",
  "cat_environmentid",
  "cat_environmentname",
  "cat_environmenturl",
  "cat_istranscriptavailablecode",
  "cat_agentcreatedby",
  "createdon",
];

const TRANSCRIPT_AVAILABLE_FILTER = "cat_istranscriptavailablecode eq 1";

const PAGE_SIZE = 5000;

/** Fetch ALL agents with transcripts, paginating through all pages automatically. */
export async function getAllAgentDetails(): Promise<AgentDetailsOption[]> {
  try {
    await ensurePowerAppsInitialized();

    const allRecords: AgentDetailsOption[] = [];
    let skipToken: string | undefined;

    while (true) {
      const result = await Cat_agentdetailsesService.getAll({
        select: AGENT_SELECT_COLUMNS,
        orderBy: ["cat_name asc"],
        filter: TRANSCRIPT_AVAILABLE_FILTER,
        maxPageSize: PAGE_SIZE,
        skipToken,
      });

      if (!result.success) {
        break;
      }

      const page = (result.data ?? [])
        .filter((entity) => Boolean(entity?.cat_agentdetailsid))
        .map(toAgentDetailsOption);

      allRecords.push(...page);

      if (!result.skipToken || page.length === 0) break;
      skipToken = result.skipToken;
    }

    return allRecords;
  } catch {
    return [];
  }
}

/** Fetch a single agent details record by its Dataverse row ID. */
export async function getAgentDetailsById(agentId: string): Promise<AgentDetailsOption | null> {
  try {
    const result = await Cat_agentdetailsesService.get(agentId, {
      select: AGENT_SELECT_COLUMNS,
    });
    if (!result.success || !result.data) return null;
    return toAgentDetailsOption(result.data);
  } catch {
    return null;
  }
}
