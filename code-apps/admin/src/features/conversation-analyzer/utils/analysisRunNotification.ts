import type { QueryClient } from '@tanstack/react-query';
import type { ConversationAnalysisRunState } from '../hooks/useConversationAnalysis';
import { queryKeys } from '../hooks/queryKeys';
import { agentResultsPath } from './resultsOrigin';

interface AnalysisRunNotification {
  intent: 'success' | 'warning' | 'error';
  title: string;
  body: string;
  resultsPath?: string;
}

/** Claims a finished run once, including across route changes and StrictMode effect replays. */
export function claimAnalysisRunNotification(client: QueryClient): AnalysisRunNotification | undefined {
  const key = queryKeys.conversationAnalysisRun();
  const run = client.getQueryData<ConversationAnalysisRunState | null>(key);
  if (!run || run.status === 'running' || run.notificationShown) return undefined;

  const failed = run.outcomes.filter((outcome) => outcome.status === 'failed').length;
  const succeeded = run.outcomes.length - failed;
  const conversations = `${succeeded.toLocaleString()} ${succeeded === 1 ? 'conversation' : 'conversations'}`;
  const resultsPath = succeeded > 0 && run.agents.length === 1
    ? agentResultsPath(run.agents[0].id, { promptId: run.promptId, origin: run.origin, environmentUrl: run.environmentUrl })
    : undefined;

  // Matches when AnalysisRunLogService writes an error log.
  const logHint = run.status === 'failed' || failed > 0
    ? ' Check the error details in the Copilot Studio Kit logs table.'
    : '';

  client.setQueryData<ConversationAnalysisRunState>(key, { ...run, notificationShown: true });

  if (run.status === 'failed') {
    return {
      intent: 'error',
      title: 'Analysis failed',
      body: `${run.error ?? 'Unable to complete analysis.'}${succeeded > 0 ? ` ${conversations} were analyzed.` : ''}${logHint}`,
      resultsPath,
    };
  }

  if (run.status === 'cancelled') {
    return {
      intent: 'warning',
      title: 'Analysis stopped',
      body: `${succeeded.toLocaleString()} of ${run.total.toLocaleString()} conversations analyzed with “${run.promptName}”. ${run.total - succeeded} not analyzed. Select them again to resume.${logHint}`,
      resultsPath,
    };
  }

  return {
    intent: failed > 0 ? 'warning' : 'success',
    title: 'Analysis complete',
    body: `${conversations} analyzed with “${run.promptName}”. ${failed.toLocaleString()} failed.${logHint}`,
    resultsPath,
  };
}
