import { createContext, useContext } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ReviewResult } from '../../contracts/ReviewResult';
import type { SkillReviewProgress } from '../contracts/SkillBundle';
import type { CopilotReviewExecutionInput } from '../hooks/useCopilotReviewMutation';

export interface CopilotReviewStartOptions {
  environmentId?: string | null;
  returnPath?: string;
}

export interface CopilotReviewRunnerValue {
  mutation: UseMutationResult<ReviewResult, Error, CopilotReviewExecutionInput>;
  progress: SkillReviewProgress | null;
  startedAt: number | null;
  watching: boolean;
  isRunning: boolean;
  start: (
    input: CopilotReviewExecutionInput,
    options?: CopilotReviewStartOptions,
  ) => void;
  reset: () => void;
  sendToBackground: () => void;
  watch: () => void;
}

export const CopilotReviewRunnerContext =
  createContext<CopilotReviewRunnerValue | null>(null);

/** Reads the application-level owner of a Copilot review run. */
export function useCopilotReviewRunner(): CopilotReviewRunnerValue {
  const value = useContext(CopilotReviewRunnerContext);
  if (!value) {
    throw new Error(
      'useCopilotReviewRunner must be used inside <CopilotReviewRunnerProvider>.',
    );
  }
  return value;
}
