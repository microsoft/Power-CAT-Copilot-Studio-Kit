import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { Cat_conversationanalyzersService } from '../../../generated/services/Cat_conversationanalyzersService';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';
import type { ConversationAnalysisOutcome, ConversationTranscriptRow, PromptRow } from '../contracts/types';
import {
  CONVERSATION_BATCH_SIZE,
  CONVERSATION_MAX_RETRIES,
  MAX_CONVERSATIONS_PER_ANALYSIS,
} from '../contracts/constants';
import { toGuid } from '../utils/conversationBrowserQuery';
import { AnalyzeService } from './AnalyzeService';

export type ConversationRowRunStatus = 'queued' | 'analyzing' | 'done' | 'failed';

/** Outcome of one conversation, including the raw result used to update analysis chips. */
export interface ConversationRunOutcome extends ConversationAnalysisOutcome {
  resultText?: string;
  createdOn?: string;
}

export interface ConversationBatchProgress {
  batchIndex: number;
  batchCount: number;
  retries: number;
  rowStatus: Record<string, ConversationRowRunStatus>;
  outcomes: ConversationRunOutcome[];
}

export interface ConversationBatchAnalysisInput {
  environmentUrl: string;
  prompt: PromptRow;
  transcripts: ConversationTranscriptRow[];
}

export interface ConversationBatchRunOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ConversationBatchProgress) => void;
}

/** Errors that a retry cannot fix (bad data, agent mismatch, empty content). */
class NonRetryableError extends Error {}

const RETRY_DELAY_MS = 1000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Analyzes selected conversations in batches of 20 (CV-21). Each conversation is retried up to
 * {@link CONVERSATION_MAX_RETRIES} times. Aborting stops before the next batch; the in-flight batch
 * finishes so no partially saved results are left behind (CV-23). Only the exact
 * (agent, transcript, prompt, environment) tuples selected are replaced.
 */
export class ConversationBatchAnalysisService {
  static async start(
    input: ConversationBatchAnalysisInput,
    options: ConversationBatchRunOptions = {},
  ): Promise<ConversationBatchProgress> {
    if (!input.transcripts.length || input.transcripts.length > MAX_CONVERSATIONS_PER_ANALYSIS) {
      throw new Error(`Select between 1 and ${MAX_CONVERSATIONS_PER_ANALYSIS} conversations.`);
    }
    if (!toGuid(input.prompt.id) || input.prompt.state !== 0) {
      throw new Error('Select an active analysis prompt.');
    }
    const environment = new URL(input.environmentUrl);
    if (environment.protocol !== 'https:' || environment.origin !== input.environmentUrl) {
      throw new Error('Select a valid Dataverse environment.');
    }
    const transcripts = [...new Map(input.transcripts.map((row) => [
      toGuid(row.id)?.toLowerCase() ?? row.id,
      row,
    ])).values()];

    const progress: ConversationBatchProgress = {
      batchIndex: 0,
      batchCount: Math.ceil(transcripts.length / CONVERSATION_BATCH_SIZE),
      retries: 0,
      rowStatus: Object.fromEntries(transcripts.map((row) => [row.id, 'queued' as const])),
      outcomes: [],
    };
    const emit = () => options.onProgress?.({
      ...progress,
      rowStatus: { ...progress.rowStatus },
      outcomes: [...progress.outcomes],
    });
    emit();

    for (let i = 0; i < transcripts.length; i += CONVERSATION_BATCH_SIZE) {
      if (options.signal?.aborted) break;
      const batch = transcripts.slice(i, i + CONVERSATION_BATCH_SIZE);
      progress.batchIndex += 1;
      for (const row of batch) progress.rowStatus[row.id] = 'analyzing';
      emit();
      await Promise.all(batch.map(async (row) => {
        const outcome = await ConversationBatchAnalysisService.analyzeWithRetry(input, row, options.signal, () => {
          progress.retries += 1;
          emit();
        });
        progress.outcomes.push(outcome);
        progress.rowStatus[row.id] = outcome.status === 'failed' ? 'failed' : 'done';
        emit();
      }));
    }
    return progress;
  }

  private static async analyzeWithRetry(
    input: ConversationBatchAnalysisInput,
    row: ConversationTranscriptRow,
    signal: AbortSignal | undefined,
    onRetry: () => void,
  ): Promise<ConversationRunOutcome> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await ConversationBatchAnalysisService.analyzeOne(input, row);
      } catch (error) {
        const canRetry = !(error instanceof NonRetryableError) && attempt < CONVERSATION_MAX_RETRIES && !signal?.aborted;
        if (!canRetry) {
          console.error('[ConversationBatchAnalysisService] Selected conversation failed:', row.id, error);
          return {
            transcriptId: row.id,
            conversationId: row.conversationId,
            agentId: row.agentId,
            agentName: row.agentName,
            status: 'failed',
            summary: error instanceof Error ? error.message : 'Unable to analyze this conversation. Previous results were kept.',
          };
        }
        onRetry();
        await wait(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  private static async analyzeOne(
    input: ConversationBatchAnalysisInput,
    row: ConversationTranscriptRow,
  ): Promise<ConversationRunOutcome> {
    const transcriptId = toGuid(row.id);
    const agentId = row.agentId && toGuid(row.agentId);
    if (!transcriptId || !agentId) throw new NonRetryableError('The conversation has no valid transcript or agent ID.');

    const result = await MicrosoftDataverseService.GetItemWithOrganization(
      '',
      'application/json',
      input.environmentUrl,
      'conversationtranscripts',
      transcriptId,
      undefined,
      undefined,
      'conversationtranscriptid,name,content,_bot_conversationtranscriptid_value',
    );
    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Unable to load the selected transcript.');
    }
    const data = result.data;
    if (
      typeof data.conversationtranscriptid !== 'string' ||
      toGuid(data.conversationtranscriptid)?.toLowerCase() !== transcriptId.toLowerCase() ||
      typeof data._bot_conversationtranscriptid_value !== 'string' ||
      toGuid(data._bot_conversationtranscriptid_value)?.toLowerCase() !== agentId.toLowerCase()
    ) {
      throw new NonRetryableError('The transcript agent changed. Refresh the conversation list before retrying.');
    }
    if (typeof data.content !== 'string' || !data.content.trim()) {
      throw new NonRetryableError('The selected transcript has no content.');
    }

    const existing = await paginatedFetchAll<Cat_conversationanalyzers>(
      Cat_conversationanalyzersService.getAll.bind(Cat_conversationanalyzersService),
      {
        select: ['cat_conversationanalyzerid'],
        filter: [
          `cat_agentid eq '${agentId}'`,
          `cat_conversationid eq '${transcriptId}'`,
          `_cat_prompt_value eq ${toGuid(input.prompt.id)}`,
          `cat_environmenturl eq '${input.environmentUrl.replace(/'/g, "''")}'`,
        ].join(' and '),
      },
    );
    const saved = await AnalyzeService.analyzeTranscript(
      {
        id: transcriptId,
        name: typeof data.name === 'string' ? data.name : row.conversationId,
        content: data.content,
      },
      agentId,
      input.environmentUrl,
      input.prompt,
      false,
    );
    const outcome: ConversationRunOutcome = {
      transcriptId: row.id,
      conversationId: row.conversationId,
      agentId: row.agentId,
      agentName: row.agentName,
      status: 'succeeded',
      recordId: saved.rowId,
      summary: saved.summary,
      resultText: saved.resultText,
      createdOn: new Date().toISOString(),
    };

    // Only remove this exact selected tuple, after its replacement is safely persisted.
    try {
      for (const previous of existing) {
        if (previous.cat_conversationanalyzerid !== saved.rowId) {
          await Cat_conversationanalyzersService.delete(previous.cat_conversationanalyzerid);
        }
      }
    } catch (error) {
      console.error('[ConversationBatchAnalysisService] Previous result cleanup failed:', error);
      outcome.status = 'warning';
    }
    return outcome;
  }
}
