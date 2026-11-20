/**
 * Prompt run statistics for Prompt insights and Manage prompts.
 *
 * Reads `cat_conversationanalyzer` with a lean column set (no transcript
 * content) and uses FetchXML aggregates where only counts are needed.
 */

import { Cat_conversationanalyzersService } from '../../../generated/services/Cat_conversationanalyzersService';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { createdOnFilterClause } from '../utils/dateRange';

/** One analysis result, reduced to the fields Prompt insights needs. */
export interface PromptRun {
  id: string;
  promptId: string;
  agentId?: string;
  environmentUrl?: string;
  createdOn?: string;
  summary?: string;
}

export interface PromptRunAggregate {
  count: number;
  lastRunAt?: string;
}

interface AnalyzerLeanRaw extends Cat_conversationanalyzers {
  _cat_prompt_value?: string;
}

interface AggregateRow {
  runsCount?: number;
  lastRunAt?: string;
  promptId?: string;
}

const LEAN_SELECT = [
  'cat_conversationanalyzerid',
  'cat_agentid',
  'cat_environmenturl',
  'cat_summary',
  '_cat_prompt_value',
  'createdon',
];

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function runFetchXml(fetchXml: string): Promise<AggregateRow[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',
    'cat_conversationanalyzers',
    undefined, // prefer
    undefined, // accept
    undefined, // x_ms_odata_metadata_full
    undefined, // MSCRM_IncludeMipSensitivityLabel
    undefined, // $select
    undefined, // $filter
    undefined, // $orderby
    undefined, // $expand
    fetchXml,
  );
  if (!result.success) {
    throw new Error('Unable to fetch prompt run stats. Check permissions.');
  }
  const data = result.data as unknown;
  if (Array.isArray(data)) return data as AggregateRow[];
  if (data && typeof data === 'object' && 'value' in data) {
    return ((data as { value?: AggregateRow[] }).value ?? []);
  }
  return [];
}

export class PromptRunStatsService {
  /** All prompt runs created in the window, newest first. */
  static async listRuns(from: string, to: string): Promise<PromptRun[]> {
    const rows = await paginatedFetchAll<Cat_conversationanalyzers>(
      (opts) => Cat_conversationanalyzersService.getAll(opts),
      {
        select: LEAN_SELECT,
        filter: `${createdOnFilterClause({ startDate: from, endDate: to })} and _cat_prompt_value ne null`,
        orderBy: ['createdon desc'],
      },
    );
    return rows.flatMap((raw) => {
      const r = raw as AnalyzerLeanRaw;
      if (!r._cat_prompt_value) return [];
      return [{
        id: r.cat_conversationanalyzerid,
        promptId: r._cat_prompt_value.toLowerCase(),
        agentId: r.cat_agentid ?? undefined,
        environmentUrl: r.cat_environmenturl || undefined,
        createdOn: r.createdon ?? undefined,
        summary: r.cat_summary ?? undefined,
      }];
    });
  }

  /** Number of prompt runs in the window (server-side count). */
  static async countRuns(from: string, to: string): Promise<number> {
    const fetchXml = [
      '<fetch aggregate="true">',
      '<entity name="cat_conversationanalyzer">',
      '<attribute name="cat_conversationanalyzerid" alias="runsCount" aggregate="count" />',
      '<filter>',
      '<condition attribute="cat_prompt" operator="not-null" />',
      `<condition attribute="createdon" operator="ge" value="${escapeXml(from)}" />`,
      `<condition attribute="createdon" operator="le" value="${escapeXml(to)}" />`,
      '</filter>',
      '</entity>',
      '</fetch>',
    ].join('');
    const rows = await runFetchXml(fetchXml);
    return rows[0]?.runsCount ?? 0;
  }

  /** All-time runs count and last run per prompt (GROUP BY prompt), keyed by lower-case prompt id. */
  static async getAllTimeStats(): Promise<Map<string, PromptRunAggregate>> {
    const fetchXml = [
      '<fetch aggregate="true">',
      '<entity name="cat_conversationanalyzer">',
      '<attribute name="cat_conversationanalyzerid" alias="runsCount" aggregate="count" />',
      '<attribute name="createdon" alias="lastRunAt" aggregate="max" />',
      '<attribute name="cat_prompt" alias="promptId" groupby="true" />',
      '<filter><condition attribute="cat_prompt" operator="not-null" /></filter>',
      '</entity>',
      '</fetch>',
    ].join('');
    const rows = await runFetchXml(fetchXml);
    const stats = new Map<string, PromptRunAggregate>();
    for (const row of rows) {
      if (row.promptId) {
        stats.set(row.promptId.toLowerCase(), { count: row.runsCount ?? 0, lastRunAt: row.lastRunAt ?? undefined });
      }
    }
    return stats;
  }

  /** Raw `cat_promptresult` JSON for the given result ids, keyed by id. */
  static async getPromptResults(ids: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (ids.length === 0) return results;
    const filter = ids.map((id) => `cat_conversationanalyzerid eq ${id.replace(/[^0-9a-fA-F-]/g, '')}`).join(' or ');
    const rows = await paginatedFetchAll<Cat_conversationanalyzers>(
      (opts) => Cat_conversationanalyzersService.getAll(opts),
      { select: ['cat_conversationanalyzerid', 'cat_promptresult'], filter },
    );
    for (const r of rows) {
      if (r.cat_promptresult) results.set(r.cat_conversationanalyzerid, r.cat_promptresult);
    }
    return results;
  }
}
