import { createContext, useContext } from 'react';
import type {
  ProgressStage,
  ReviewExecutionInput,
} from '../hooks/useReviewMutation';

export interface StandardReviewStartOptions {
  environmentId?: string | null;
  returnPath?: string;
}

export interface StandardReviewRunnerValue {
  progressStages: ProgressStage[];
  startedAt: number | null;
  watching: boolean;
  isRunning: boolean;
  activeBotId: string | null;
  start: (
    input: ReviewExecutionInput,
    options?: StandardReviewStartOptions,
  ) => void;
  sendToBackground: () => void;
  watch: () => void;
}

export const StandardReviewRunnerContext =
  createContext<StandardReviewRunnerValue | null>(null);

/** Reads the application-level owner of a Standard review run. */
export function useStandardReviewRunner(): StandardReviewRunnerValue {
  const value = useContext(StandardReviewRunnerContext);
  if (!value) {
    throw new Error(
      'useStandardReviewRunner must be used inside <StandardReviewRunnerProvider>.',
    );
  }
  return value;
}
