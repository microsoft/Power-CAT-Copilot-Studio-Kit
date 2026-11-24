/**
 * Service wrapper for cat_agentdetails (Elastic table).
 *
 * The plan resolves "Total Agents" + the agent name registry to this table.
 * Local to the feature (per feature-first architecture) so it doesn't reach
 * into agent-insights-hub. Reuses the same generated service though.
 */

import { Cat_agentdetailsesService } from '../../../generated/services/Cat_agentdetailsesService';
import type { Cat_agentdetailses } from '../../../generated/models/Cat_agentdetailsesModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';

export interface AgentLite {
  agentDetailsId: string;
  agentId?: string;
  name?: string;
  environmentName?: string;
  environmentUrl?: string;
}

const SELECT: string[] = ['cat_agentdetailsid', 'cat_agentid', 'cat_name', 'cat_environmentname', 'cat_environmenturl'];

const TRANSCRIPT_AVAILABLE_FILTER = 'cat_istranscriptavailablecode eq 1';

/** Raw shape returned from Dataverse for cat_agentdetails rows. */
interface AgentDetailsRaw {
  cat_agentdetailsid: string;
  cat_agentid?: string;
  cat_name?: string;
  cat_environmentname?: string;
  cat_environmenturl?: string;
}

function toAgentLite(raw: Cat_agentdetailses): AgentLite {
  const r = raw as unknown as AgentDetailsRaw;
  return {
    agentDetailsId: r.cat_agentdetailsid,
    agentId: r.cat_agentid,
    name: r.cat_name,
    environmentName: r.cat_environmentname,
    environmentUrl: r.cat_environmenturl,
  };
}

function buildSearchFilter(search?: string): string | undefined {
  const trimmed = search?.trim() ?? '';
  if (!trimmed) return undefined;
  const escaped = trimmed.replace(/'/g, "''");
  return `(contains(cat_name,'${escaped}') or contains(cat_environmentname,'${escaped}'))`;
}

export class AgentService {
  /** Fetch all agents (with optional name search). */
  static async list(search?: string): Promise<AgentLite[]> {
    const rows = await paginatedFetchAll<Cat_agentdetailses>(
      (opts) => Cat_agentdetailsesService.getAll(opts),
      { select: SELECT, filter: buildSearchFilter(search), orderBy: ['cat_name asc'] },
    );
    return rows.map(toAgentLite);
  }

  /**
   * Fetch only agents whose `cat_istranscriptavailablecode` is "Yes" (1) on
   * `cat_agentdetails`. This is the user-facing agent set for the
   * Conversation Analyzer - agents with no transcripts are out of scope.
   */
  static async listWithTranscripts(options: { search?: string } = {}): Promise<AgentLite[]> {
    const searchFilter = buildSearchFilter(options.search);
    const filter = searchFilter
      ? `${TRANSCRIPT_AVAILABLE_FILTER} and ${searchFilter}`
      : TRANSCRIPT_AVAILABLE_FILTER;

    const rows = await paginatedFetchAll<Cat_agentdetailses>(
      (opts) => Cat_agentdetailsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_name asc'] },
    );
    return rows.map(toAgentLite);
  }
}
