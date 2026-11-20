/**
 * Service wrapper for the cat_conversationanalyzer Dataverse table.
 *
 * Returns the raw generated row type for now - the UI layer (hooks) will
 * project to {@link AnalyzerRow} after `cat_promptresult` parsing is wired
 * up in Phase 1. Pagination uses the shared `paginatedFetchAll` helper so a
 * single call always returns the full match set despite the 500-row SDK cap.
 */

import { Cat_conversationanalyzersService } from '../../../generated/services/Cat_conversationanalyzersService';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { createdOnFilterClause } from '../utils/dateRange';
import type { AnalyzerFilter } from '../contracts/types';

const SELECT: string[] = [
  'cat_conversationanalyzerid',
  'cat_agentid',
  'cat_conversationid',
  'cat_content',
  'cat_conversationdurationseconds',
  'cat_environmenturl',
  'cat_messages',
  'cat_name',
  'cat_promptresult',
  'cat_summary',
  '_cat_prompt_value',
  '_createdby_value',
  'createdon',
];

function buildFilter(filter: AnalyzerFilter): string {
  const parts: string[] = [];
  if (filter.startDate && filter.endDate) {
    parts.push(createdOnFilterClause(filter));
  }
  if (filter.agentId) {
    parts.push(`cat_agentid eq '${filter.agentId.replace(/'/g, "''")}'`);
  }
  if (filter.environmentUrl) {
    const safeUrl = filter.environmentUrl.replace(/'/g, "''");
    parts.push(`(cat_environmenturl eq null or cat_environmenturl eq '' or cat_environmenturl eq '${safeUrl}')`);
  }
  if (filter.promptId) {
    parts.push(`_cat_prompt_value eq '${filter.promptId.replace(/'/g, "''")}'`);
  }
  return parts.join(' and ');
}

export class ConversationAnalyzerService {
  /** Fetch all conversation-analyzer rows matching the filter. */
  static async list(filter: AnalyzerFilter): Promise<Cat_conversationanalyzers[]> {
    return paginatedFetchAll<Cat_conversationanalyzers>(
      (opts) => Cat_conversationanalyzersService.getAll(opts),
      {
        select: SELECT,
        filter: buildFilter(filter),
        orderBy: ['createdon desc'],
      },
    );
  }

  /** Fetch a single conversation-analyzer row by id. */
  static async getById(id: string): Promise<Cat_conversationanalyzers | undefined> {
    const result = await Cat_conversationanalyzersService.get(id, { select: SELECT });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to fetch analyzer row');
    return result.data;
  }

  /** Delete a single analyzer row by id. */
  static async delete(id: string): Promise<void> {
    await Cat_conversationanalyzersService.delete(id);
  }

  /** Delete all analyzer rows associated with a given prompt ID. */
  static async deleteByPromptId(promptId: string): Promise<void> {
    const rows = await paginatedFetchAll<Cat_conversationanalyzers>(
      (opts) => Cat_conversationanalyzersService.getAll(opts),
      {
        select: ['cat_conversationanalyzerid'],
        filter: `_cat_prompt_value eq '${promptId.replace(/'/g, "''")}'`,
      },
    );
    await Promise.all(rows.map((r) => Cat_conversationanalyzersService.delete(r.cat_conversationanalyzerid)));
  }
}
