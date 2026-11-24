import { createContext, useContext } from 'react';
import type {
  DAReviewExecutionInput,
  DAReviewProgress,
} from '../hooks/useDAReviewMutation';

export interface DAReviewRunnerValue {
  isRunning: boolean;
  progress: DAReviewProgress | null;
  activeAgentName: string | null;
  start: (input: DAReviewExecutionInput) => void;
}

export const DAReviewRunnerContext =
  createContext<DAReviewRunnerValue | null>(null);

/** Reads the application-level owner of a Declarative Agent review. */
export function useDAReviewRunner(): DAReviewRunnerValue {
  const value = useContext(DAReviewRunnerContext);
  if (!value) {
    throw new Error(
      'useDAReviewRunner must be used inside <DAReviewRunnerProvider>.',
    );
  }
  return value;
}
