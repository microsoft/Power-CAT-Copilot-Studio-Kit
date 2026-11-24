/**
 * Loads which transcripts in an environment have been analyzed, and with which prompt/outcome.
 * Results live in the Kit environment while transcripts live in each agent's environment, so the
 * join is done client-side (FR-D2) through the map returned here.
 */

import { Cat_conversationanalyzersService } from '../../../generated/services/Cat_conversationanalyzersService';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { getAnalysisOutcome, type AnalysisOutcomeTone } from '../utils/analysisOutcome';

export interface AnalysisIndexEntry {
  recordId: string;
  agentId?: string;
  promptId?: string;
  createdOn?: string;
  outcomeLabel: string;
  tone: AnalysisOutcomeTone;
  summary?: string;
}

/** Transcript ID (lower case) → analyses, newest first. */
export type AnalysisIndex = Map<string, AnalysisIndexEntry[]>;

const SELECT = [
  'cat_conversationanalyzerid',
  'cat_conversationid',
  'cat_agentid',
  '_cat_prompt_value',
  'cat_promptresult',
  'cat_summary',
  'createdon',
];

function escape(value: string): string {
  return value.replace(/'/g, "''");
}

/** Matches rows stored with or without a trailing slash; legacy rows without a URL are included. */
function environmentClause(environmentUrl: string): string {
  const trimmed = escape(environmentUrl.replace(/\/+$/, ''));
  return `(cat_environmenturl eq null or cat_environmenturl eq '${trimmed}' or cat_environmenturl eq '${trimmed}/')`;
}

export function toIndexKey(transcriptId: string): string {
  return transcriptId.replace(/[{}]/g, '').toLowerCase();
}

/** Converts a stored analyzer row into an index entry. */
export function toIndexEntry(row: Pick<Cat_conversationanalyzers,
  'cat_conversationanalyzerid' | 'cat_agentid' | '_cat_prompt_value' | 'createdon' | 'cat_promptresult' | 'cat_summary'>,
): AnalysisIndexEntry {
  const outcome = getAnalysisOutcome(row.cat_promptresult, row.cat_summary);
  return {
    recordId: row.cat_conversationanalyzerid,
    agentId: row.cat_agentid ?? undefined,
    promptId: row._cat_prompt_value ?? undefined,
    createdOn: row.createdon ?? undefined,
    outcomeLabel: outcome.label,
    tone: outcome.tone,
    summary: row.cat_summary ?? undefined,
  };
}

export class ConversationAnalysisIndexService {
  /** Loads every analysis stored for an environment, keyed by transcript ID. */
  static async load(environmentUrl: string): Promise<AnalysisIndex> {
    const rows = await paginatedFetchAll<Cat_conversationanalyzers>(
      (opts) => Cat_conversationanalyzersService.getAll(opts),
      { select: SELECT, filter: environmentClause(environmentUrl), orderBy: ['createdon desc'] },
    );
    const index: AnalysisIndex = new Map();
    for (const row of rows) {
      if (!row.cat_conversationid) continue;
      const key = toIndexKey(row.cat_conversationid);
      const entries = index.get(key) ?? [];
      // Keep only the newest result per prompt.
      if (!entries.some((e) => e.promptId === row._cat_prompt_value)) entries.push(toIndexEntry(row));
      index.set(key, entries);
    }
    return index;
  }

  /** Counts distinct transcripts analyzed in an environment within a date window (environment cards, CV-2). */
  static async countAnalyzed(environmentUrl: string, since?: string, until?: string): Promise<number> {
    const clauses = [environmentClause(environmentUrl)];
    if (since) clauses.push(`createdon ge ${since}`);
    if (until) clauses.push(`createdon lt ${until}`);
    const rows = await paginatedFetchAll<Cat_conversationanalyzers>(
      (opts) => Cat_conversationanalyzersService.getAll(opts),
      { select: ['cat_conversationid'], filter: clauses.join(' and ') },
    );
    return new Set(rows.map((r) => r.cat_conversationid && toIndexKey(r.cat_conversationid)).filter(Boolean)).size;
  }
}
