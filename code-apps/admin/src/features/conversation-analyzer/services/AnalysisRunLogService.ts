import { Cat_copilotstudiokitlogsesService } from '../../../generated/services/Cat_copilotstudiokitlogsesService';
import type { Cat_copilotstudiokitlogsesBase } from '../../../generated/models/Cat_copilotstudiokitlogsesModel';
import type { ConversationRunOutcome } from './ConversationBatchAnalysisService';

/** `cat_executionstatuscode` choice value for "Error". */
const EXECUTION_STATUS_ERROR = 4;

export interface AnalysisRunLogInput {
  environmentName: string;
  environmentUrl: string;
  promptName: string;
  startedAt: Date;
  endedAt: Date;
  outcomes: ConversationRunOutcome[];
  /** Error that stopped the whole run, if any. */
  runError?: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local `YYYY-MM-DD HH:mm:ss`, used in the log name. */
function formatLogTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Writes a Copilot Studio Kit log row when an analysis run has failures. Runs where every
 * conversation succeeded are not logged. Best-effort: a logging failure never affects the run.
 */
export async function logAnalysisRunErrors(input: AnalysisRunLogInput): Promise<void> {
  const failures = input.outcomes.filter((outcome) => outcome.status === 'failed');
  if (!failures.length && !input.runError) return;

  const details = {
    environment: input.environmentName,
    environmentUrl: input.environmentUrl,
    promptName: input.promptName,
    failed: failures.length,
    ...(input.runError ? { runError: input.runError } : {}),
    errors: failures.map((outcome) => ({
      conversationId: outcome.conversationId ?? outcome.transcriptId,
      agentName: outcome.agentName ?? outcome.agentId ?? 'Unknown agent',
      errorMessage: outcome.summary ?? 'Unknown error.',
    })),
  };

  try {
    const result = await Cat_copilotstudiokitlogsesService.create({
      cat_name: `ConversationAnalyzer - ${formatLogTimestamp(input.startedAt)}`,
      cat_executionstatuscode: EXECUTION_STATUS_ERROR,
      cat_errormessage: JSON.stringify(details, null, 2),
      cat_startdate: input.startedAt.toISOString(),
      cat_enddate: input.endedAt.toISOString(),
    } as unknown as Omit<Cat_copilotstudiokitlogsesBase, 'cat_copilotstudiokitlogsid'>);
    if (!result.success) throw result.error ?? new Error('Log create failed.');
  } catch (error) {
    console.error('[AnalysisRunLogService] Unable to write the analysis error log:', error);
  }
}
