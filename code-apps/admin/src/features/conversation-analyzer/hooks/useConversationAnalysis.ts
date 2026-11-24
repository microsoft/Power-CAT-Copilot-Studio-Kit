import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ConversationAgentOption } from '../contracts/types';
import {
  ConversationBatchAnalysisService,
  type ConversationBatchAnalysisInput,
  type ConversationBatchProgress,
  type ConversationRowRunStatus,
  type ConversationRunOutcome,
} from '../services/ConversationBatchAnalysisService';
import { toIndexEntry, toIndexKey, type AnalysisIndex } from '../services/ConversationAnalysisIndexService';
import { logAnalysisRunErrors } from '../services/AnalysisRunLogService';
import { analysisIndexKey } from './useConversationAnalysisIndex';
import { ANALYZER_BASE_KEY } from './useAnalyzerBase';
import type { AnalyzerBase } from '../services/analyzerBase';
import { mergeAnalyzerResults } from '../utils/mergeAnalyzerResults';
import { queryKeys } from './queryKeys';

export interface ConversationAnalysisRunState {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  cancelRequested?: boolean;
  environmentUrl: string;
  environmentName: string;
  agents: ConversationAgentOption[];
  promptId: string;
  promptName: string;
  total: number;
  batchIndex: number;
  batchCount: number;
  retries: number;
  rowStatus: Record<string, ConversationRowRunStatus>;
  outcomes: ConversationRunOutcome[];
  error?: string;
  notificationShown?: boolean;
  /** Tab the run was started from (see utils/resultsOrigin), kept for the "View results" link. */
  origin?: string;
}

export interface ConversationAnalysisStartInput extends ConversationBatchAnalysisInput {
  environmentName: string;
  origin?: string;
}

const runKey = queryKeys.conversationAnalysisRun();
// One run at a time per app session; kept outside React so it survives tab switches.
let activeController: AbortController | undefined;

function patchRun(client: QueryClient, patch: Partial<ConversationAnalysisRunState>) {
  client.setQueryData<ConversationAnalysisRunState | null>(runKey, (current) => (current ? { ...current, ...patch } : current));
}

/** Adds finished results to the cached analysis index so chips update without a refetch (CV-22). */
function mergeIntoIndex(client: QueryClient, environmentUrl: string, promptId: string, outcomes: ConversationRunOutcome[]) {
  client.setQueryData<AnalysisIndex>(analysisIndexKey(environmentUrl), (current) => {
    if (!current) return current;
    const next: AnalysisIndex = new Map(current);
    for (const outcome of outcomes) {
      if (outcome.status === 'failed' || !outcome.recordId) continue;
      const key = toIndexKey(outcome.transcriptId);
      const entry = toIndexEntry({
        cat_conversationanalyzerid: outcome.recordId,
        cat_agentid: outcome.agentId,
        _cat_prompt_value: promptId,
        createdon: outcome.createdOn,
        cat_promptresult: outcome.resultText,
        cat_summary: outcome.summary,
      });
      next.set(key, [entry, ...(next.get(key) ?? []).filter((e) => e.promptId !== promptId)]);
    }
    return next;
  });
}

async function runAnalysis(client: QueryClient, input: ConversationAnalysisStartInput, signal: AbortSignal) {
  const startedAt = new Date();
  let merged = 0;
  let latestOutcomes: ConversationRunOutcome[] = [];
  const onProgress = (progress: ConversationBatchProgress) => {
    latestOutcomes = progress.outcomes;
    patchRun(client, progress);
    if (progress.outcomes.length > merged) {
      const outcomes = progress.outcomes.slice(merged);
      mergeIntoIndex(client, input.environmentUrl, input.prompt.id, outcomes);
      client.setQueryData<AnalyzerBase>(ANALYZER_BASE_KEY, (base) =>
        mergeAnalyzerResults(base, input.environmentUrl, input.prompt.id, outcomes),
      );
      merged = progress.outcomes.length;
    }
  };
  let runError: string | undefined;
  try {
    const result = await ConversationBatchAnalysisService.start(input, { signal, onProgress });
    onProgress(result);
    const finished = result.outcomes.length;
    patchRun(client, { status: signal.aborted && finished < input.transcripts.length ? 'cancelled' : 'completed' });
  } catch (error) {
    console.error('[useConversationAnalysis] Batch analysis failed:', error);
    runError = error instanceof Error ? error.message : 'Unable to complete analysis. Previous results were kept.';
    patchRun(client, { status: 'failed', error: runError });
  } finally {
    activeController = undefined;
    void logAnalysisRunErrors({
      environmentName: input.environmentName,
      environmentUrl: input.environmentUrl,
      promptName: input.prompt.displayName ?? input.prompt.name,
      startedAt,
      endedAt: new Date(),
      outcomes: latestOutcomes,
      runError,
    });
    void client.invalidateQueries({
      queryKey: queryKeys.all,
      predicate: (query) => !['conversation-browser', 'conversation-batch-analysis', 'conversation-analysis-index', 'analyzer-base']
        .includes(String(query.queryKey[1])),
    });
    void client.invalidateQueries({
      queryKey: ANALYZER_BASE_KEY,
      exact: true,
      refetchType: 'all',
    });
  }
}

/**
 * Runs batch analysis in the background and exposes progress and cancellation (CV-21…24).
 * The run lives in the query cache so it stays visible across tab switches and screens.
 */
export function useConversationAnalysis() {
  const queryClient = useQueryClient();
  const { data: run } = useQuery<ConversationAnalysisRunState | null>({
    queryKey: runKey,
    queryFn: () => null,
    initialData: null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const start = useCallback((input: ConversationAnalysisStartInput): boolean => {
    if (queryClient.getQueryData<ConversationAnalysisRunState>(runKey)?.status === 'running') {
      console.warn('[useConversationAnalysis] An analysis run is already in progress.');
      return false;
    }
    const snapshot: ConversationAnalysisStartInput = {
      ...input,
      prompt: { ...input.prompt },
      transcripts: input.transcripts.map((row) => ({ ...row })),
    };
    const agents = new Map<string, ConversationAgentOption>();
    for (const row of snapshot.transcripts) {
      if (row.agentId) agents.set(row.agentId, { id: row.agentId, name: row.agentName ?? row.agentId });
    }
    queryClient.setQueryData<ConversationAnalysisRunState>(runKey, {
      status: 'running',
      environmentUrl: snapshot.environmentUrl,
      environmentName: snapshot.environmentName,
      agents: [...agents.values()],
      promptId: snapshot.prompt.id,
      promptName: snapshot.prompt.displayName ?? snapshot.prompt.name,
      total: snapshot.transcripts.length,
      batchIndex: 0,
      batchCount: 0,
      retries: 0,
      rowStatus: {},
      outcomes: [],
      origin: snapshot.origin,
    });
    activeController = new AbortController();
    void runAnalysis(queryClient, snapshot, activeController.signal);
    return true;
  }, [queryClient]);

  const cancel = useCallback(() => {
    if (!activeController) return;
    patchRun(queryClient, { cancelRequested: true });
    activeController.abort();
  }, [queryClient]);

  return { run, start, cancel, isRunning: run?.status === 'running' };
}
