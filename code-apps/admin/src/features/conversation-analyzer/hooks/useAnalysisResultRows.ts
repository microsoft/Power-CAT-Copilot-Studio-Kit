import { useMemo } from 'react';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';
import type { ConversationGridRow, ConversationGridSortState } from '../components/shared/conversation-grid/types';
import { getAnalysisOutcome, type AnalysisOutcome } from '../utils/analysisOutcome';
import { summarizeTranscript } from '../utils/transcriptSummary';

/** Initial results grid sort; the details screen's Previous / Next follows the same order. */
export const DEFAULT_RESULTS_SORT: ConversationGridSortState = { sortColumn: 'startTime', sortDirection: 'descending' };

/** One stored analysis result shaped for the shared conversation grid (AR-3). */
export interface AnalysisResultRow extends ConversationGridRow {
  promptId?: string;
  outcome: AnalysisOutcome;
  completed: boolean;
  record: Cat_conversationanalyzers;
}

/** Maps analyzer rows to grid rows; the grid row ID is the analyzer record ID (used by delete and View result). */
export function toAnalysisResultRow(record: Cat_conversationanalyzers, promptLabels: ReadonlyMap<string, string>): AnalysisResultRow {
  const outcome = getAnalysisOutcome(record.cat_promptresult, record.cat_summary);
  const summary = summarizeTranscript(record.cat_content ?? undefined);
  const promptId = record._cat_prompt_value?.toLowerCase() || undefined;
  return {
    id: record.cat_conversationanalyzerid,
    transcriptId: record.cat_conversationid || record.cat_conversationanalyzerid,
    conversationId: record.cat_name || record.cat_conversationid || record.cat_conversationanalyzerid,
    topic: summary.topic,
    startTime: summary.startTime ?? record.createdon ?? undefined,
    durationSeconds: record.cat_conversationdurationseconds ?? undefined,
    messageCount: record.cat_messages ?? undefined,
    analyses: [{
      key: record.cat_conversationanalyzerid,
      promptLabel: (promptId && promptLabels.get(promptId)) || 'Prompt',
      outcomeLabel: outcome.label,
      tone: outcome.tone,
    }],
    summary: record.cat_summary ?? undefined,
    promptId,
    outcome,
    completed: Boolean(record.cat_promptresult?.trim() || record.cat_summary?.trim()),
    record,
  };
}

/** Memoized {@link toAnalysisResultRow} over a result list. */
export function useAnalysisResultRows(
  records: readonly Cat_conversationanalyzers[] | undefined,
  promptLabels: ReadonlyMap<string, string>,
): AnalysisResultRow[] {
  return useMemo(
    () => (records ?? []).map((record) => toAnalysisResultRow(record, promptLabels)),
    [promptLabels, records],
  );
}
