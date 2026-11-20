import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { DAReviewProgressDialog } from '../components/DAReviewProgressDialog';
import {
  hasDACustomSkillStage,
  isDAReviewWorkflowBacked,
} from '../components/daProgressStages';
import {
  useDAReviewMutation,
  type DAPreparedReviewInput,
  type DAReviewExecutionInput,
} from '../hooks/useDAReviewMutation';
import {
  clearDAReviewRecovery,
  createDAReviewRecovery,
  readDAReviewRecovery,
  writeDAReviewRecovery,
  type DAReviewRecovery,
} from '../services/daReviewRecovery';
import {
  DAReviewRunnerContext,
  type DAReviewRunnerValue,
} from './daReviewRunnerContext';
import { logReviewStarted } from '../../utils/reviewTelemetry';

interface ActiveReview {
  input: DAReviewExecutionInput;
  startedAt: number;
}

export interface DAReviewRunnerProviderProps {
  children: ReactNode;
}

/**
 * Owns Declarative Agent review execution above route content and resumes the
 * durable Dataverse job after an app restart.
 */
export function DAReviewRunnerProvider({
  children,
}: DAReviewRunnerProviderProps) {
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);
  const activeReviewRef = useRef<ActiveReview | null>(null);
  const recoveryRef = useRef<DAReviewRecovery | null>(null);
  const executionInFlightRef = useRef(false);
  const executionGenerationRef = useRef(0);
  const restoreAttemptedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);

  const handlePrepared = useCallback((prepared: DAPreparedReviewInput) => {
    const startedAt = startedAtRef.current;
    if (startedAt === null) return;
    const next: DAReviewRecovery = {
      ...createDAReviewRecovery(prepared, startedAt),
      ...(recoveryRef.current?.jobId
        ? { jobId: recoveryRef.current.jobId }
        : {}),
    };
    recoveryRef.current = next;
    writeDAReviewRecovery(next);
  }, []);

  const handleJobSubmitted = useCallback((jobId: string) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    const next = { ...recovery, jobId };
    recoveryRef.current = next;
    writeDAReviewRecovery(next);
  }, []);

  const mutation = useDAReviewMutation({
    onPrepared: handlePrepared,
    onJobSubmitted: handleJobSubmitted,
  });
  const runReviewRef = useRef(mutation.runReview);
  useEffect(() => {
    runReviewRef.current = mutation.runReview;
  }, [mutation.runReview]);

  const clearActive = useCallback(() => {
    activeReviewRef.current = null;
    recoveryRef.current = null;
    abortRef.current = null;
    startedAtRef.current = null;
    executionInFlightRef.current = false;
    setActiveReview(null);
  }, []);

  const execute = useCallback((
    input: DAReviewExecutionInput,
    startedAt: number,
  ) => {
    const active = { input, startedAt };
    activeReviewRef.current = active;
    startedAtRef.current = startedAt;
    const controller = new AbortController();
    abortRef.current = controller;
    executionInFlightRef.current = true;
    setActiveReview(active);
    const generation = ++executionGenerationRef.current;

    void runReviewRef.current({
      ...input,
      abortSignal: controller.signal,
    })
      .then((review) => {
        if (generation !== executionGenerationRef.current) return;
        clearDAReviewRecovery();
        clearActive();
        mutation.reset();
        if (review.reviewId) {
          navigate(`/agent-review-tool/declarative/${review.reviewId}`);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation === executionGenerationRef.current) {
          executionInFlightRef.current = false;
        }
      });
  }, [clearActive, mutation, navigate]);

  const start = useCallback((input: DAReviewExecutionInput) => {
    if (executionInFlightRef.current) return;
    logReviewStarted();
    mutation.reset();
    const startedAt = Date.now();
    recoveryRef.current = null;
    execute({
      ...input,
      correlationId: crypto.randomUUID(),
      existingJobId: undefined,
      workflowRequest: undefined,
    }, startedAt);
  }, [execute, mutation]);

  const cancel = useCallback(() => {
    executionGenerationRef.current += 1;
    abortRef.current?.abort();
    clearDAReviewRecovery();
    clearActive();
    mutation.reset();
  }, [clearActive, mutation]);

  const retry = useCallback(() => {
    const current = activeReviewRef.current;
    if (!current || executionInFlightRef.current) return;

    mutation.reset();
    recoveryRef.current = null;
    const correlationId = crypto.randomUUID();
    const workflowRequest = current.input.workflowRequest
      ? {
          ...current.input.workflowRequest,
          correlationId,
        }
      : undefined;
    execute({
      ...current.input,
      correlationId,
      existingJobId: undefined,
      workflowRequest,
    }, Date.now());
  }, [execute, mutation]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    const recovery = readDAReviewRecovery();
    if (!recovery || executionInFlightRef.current) return;

    recoveryRef.current = recovery;
    const input: DAReviewExecutionInput = {
      ...recovery.input,
      existingJobId: recovery.jobId,
      correlationId: recovery.input.workflowRequest.correlationId,
    };
    execute(input, recovery.startedAt);
  }, [execute]);

  const value = useMemo<DAReviewRunnerValue>(() => ({
    isRunning: mutation.isRunning,
    progress: mutation.progress,
    activeAgentName:
      activeReview?.input.manifest.name
      || activeReview?.input.manifest.shortName
      || null,
    start,
  }), [activeReview, mutation.isRunning, mutation.progress, start]);

  return (
    <DAReviewRunnerContext.Provider value={value}>
      {children}
      <DAReviewProgressDialog
        open={activeReview !== null}
        agentName={activeReview?.input.manifest.name
          || activeReview?.input.manifest.shortName
          || ''}
        progress={mutation.progress}
        error={mutation.isRunning ? null : mutation.error}
        workflowBacked={activeReview ? isDAReviewWorkflowBacked(activeReview.input) : false}
        hasCustomSkills={activeReview ? hasDACustomSkillStage(activeReview.input) : false}
        onCancel={cancel}
        onRetry={retry}
      />
    </DAReviewRunnerContext.Provider>
  );
}
