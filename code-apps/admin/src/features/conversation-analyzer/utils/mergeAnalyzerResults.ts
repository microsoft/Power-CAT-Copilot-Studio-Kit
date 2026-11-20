import type { AnalyzerBase, AnalyzerBaseRow } from '../services/analyzerBase';
import type { ConversationRunOutcome } from '../services/ConversationBatchAnalysisService';
import { toIndexKey, type AnalysisIndex } from '../services/ConversationAnalysisIndexService';
import { parsePromptResult } from './parsePromptResult';

/** Reflects persisted results in the shared Agents/Overview snapshot without counting replacements twice. */
export function mergeAnalyzerResults(
  base: AnalyzerBase | undefined,
  environmentUrl: string,
  promptId: string,
  outcomes: ConversationRunOutcome[],
): AnalyzerBase | undefined {
  if (!base) return base;
  const saved = outcomes.filter((outcome) => outcome.status !== 'failed' && outcome.recordId);
  if (!saved.length) return base;
  const sameId = (left: string | undefined, right: string | undefined) =>
    Boolean(left && right && toIndexKey(left) === toIndexKey(right));
  const rows = base.rows.filter((row) => !saved.some((outcome) =>
    sameId(row.recordId, outcome.recordId) ||
    (outcome.status === 'succeeded' &&
      row.environmentUrl === environmentUrl &&
      sameId(row.agentId, outcome.agentId) &&
      sameId(row.conversationId, outcome.transcriptId) &&
      sameId(row.promptId, promptId)),
  ));
  const replacements: AnalyzerBaseRow[] = saved.map((outcome) => ({
    recordId: outcome.recordId,
    promptId,
    agentId: outcome.agentId,
    environmentUrl,
    conversationId: outcome.transcriptId,
    createdOn: outcome.createdOn,
    pending: !outcome.resultText,
    parsed: outcome.resultText ? parsePromptResult(outcome.resultText) : undefined,
  }));
  return { ...base, rows: [...rows, ...replacements] };
}

/** Removes deleted analyzer records from the shared Agents/Overview snapshot. */
export function removeAnalyzerResults(base: AnalyzerBase | undefined, recordIds: ReadonlySet<string>): AnalyzerBase | undefined {
  if (!base || recordIds.size === 0) return base;
  const rows = base.rows.filter((row) => !row.recordId || !recordIds.has(toIndexKey(row.recordId)));
  return rows.length === base.rows.length ? base : { ...base, rows };
}

/** Removes deleted analyzer records from a per-environment analysis index; empty transcripts are dropped. */
export function removeFromAnalysisIndex(index: AnalysisIndex | undefined, recordIds: ReadonlySet<string>): AnalysisIndex | undefined {
  if (!index || recordIds.size === 0) return index;
  let changed = false;
  const next: AnalysisIndex = new Map();
  for (const [transcriptKey, entries] of index) {
    const kept = entries.filter((entry) => !recordIds.has(toIndexKey(entry.recordId)));
    if (kept.length !== entries.length) changed = true;
    if (kept.length) next.set(transcriptKey, kept);
  }
  return changed ? next : index;
}
