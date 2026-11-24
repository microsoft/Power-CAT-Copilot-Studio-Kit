/**
 * Shared all-time dataset behind the Overview and Agents tabs.
 *
 * Agents and analyzer rows are fetched once (all time) and parsed up front so
 * every Overview card and the Agents grid derive their numbers from the same
 * snapshot. Period scoping happens client-side in the rollup helpers.
 */

import { AgentService, type AgentLite } from './AgentService';
import { ConversationAnalyzerService } from './ConversationAnalyzerService';
import { parsePromptResult, type ParsedPromptResult } from '../utils/parsePromptResult';

export interface AnalyzerBaseRow {
  recordId?: string;
  promptId?: string;
  agentId?: string;
  environmentUrl?: string;
  conversationId?: string;
  createdOn?: string;
  /** True when the prompt has not produced a result yet. */
  pending: boolean;
  parsed?: ParsedPromptResult;
}

export interface AnalyzerBase {
  agents: AgentLite[];
  rows: AnalyzerBaseRow[];
}

const ALL_TIME = {
  startDate: '1970-01-01T00:00:00.000Z',
  endDate: '2999-12-31T23:59:59.999Z',
};

/** Fetches agents with transcripts plus every analyzer row, parsing prompt results once. */
export async function fetchAnalyzerBase(): Promise<AnalyzerBase> {
  const [agents, analyzerRows] = await Promise.all([
    AgentService.listWithTranscripts(),
    ConversationAnalyzerService.list(ALL_TIME),
  ]);

  const rows: AnalyzerBaseRow[] = analyzerRows.map((r) => ({
    recordId: r.cat_conversationanalyzerid,
    promptId: r._cat_prompt_value,
    agentId: r.cat_agentid,
    environmentUrl: r.cat_environmenturl ?? undefined,
    conversationId: r.cat_conversationid,
    createdOn: r.createdon,
    pending: !r.cat_promptresult,
    parsed: r.cat_promptresult ? parsePromptResult(r.cat_promptresult) : undefined,
  }));

  return { agents, rows };
}

/** Returns rows whose `createdOn` falls inside the inclusive ISO range. */
export function rowsInPeriod(rows: AnalyzerBaseRow[], from: string, to: string): AnalyzerBaseRow[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return rows.filter((r) => {
    if (!r.createdOn) return false;
    const t = Date.parse(r.createdOn);
    return t >= start && t <= end;
  });
}

/** Groups rows by `agentId` for fast per-agent lookup. */
export function groupRowsByAgentId(rows: AnalyzerBaseRow[]): Map<string, AnalyzerBaseRow[]> {
  const map = new Map<string, AnalyzerBaseRow[]>();
  for (const r of rows) {
    if (!r.agentId) continue;
    const list = map.get(r.agentId);
    if (list) list.push(r);
    else map.set(r.agentId, [r]);
  }
  return map;
}
