import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Spinner,
  Text,
  makeStyles,
  tokens,
  useRestoreFocusTarget,
} from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  DismissRegular,
  ErrorCircleFilled,
  OpenRegular,
} from '@fluentui/react-icons';
import { ReviewBackgroundBadge } from '../../components/ReviewBackgroundBadge';
import { classifyAIError } from '../../utils/aiErrorClassifier';
import { logReviewStarted } from '../../utils/reviewTelemetry';
import { CopilotReviewProgressDialog } from '../components/CopilotReviewProgressDialog';
import { stageRank } from '../components/copilotProgressStages';
import { ReviewJobError } from '../contracts/ReviewJob';
import type { SkillReviewProgress } from '../contracts/SkillBundle';
import {
  useCopilotReviewMutation,
  type CopilotReviewExecutionInput,
} from '../hooks/useCopilotReviewMutation';
import { findLatestJobForBot } from '../services/jobs/ReviewJobService';
import {
  clearCopilotReviewRecovery,
  createCopilotReviewRecovery,
  readCopilotReviewRecovery,
  writeCopilotReviewRecovery,
  type CopilotReviewRecovery,
} from '../services/jobs/copilotReviewRecovery';
import {
  buildRunSearchParams,
  buildViewSearchParams,
} from '../utils/copilotReviewRouteState';
import {
  CopilotReviewRunnerContext,
  type CopilotReviewRunnerValue,
  type CopilotReviewStartOptions,
} from './copilotReviewRunnerContext';

const DEFAULT_RETURN_PATH = '/agent-review-tool';

const useStyles = makeStyles({
  label: { color: tokens.colorNeutralForeground1 },
  name: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '180px',
  },
  ready: {
    color: tokens.colorPaletteGreenForeground1,
    flexShrink: 0,
  },
  failed: {
    color: tokens.colorPaletteRedForeground1,
    flexShrink: 0,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
});

interface ActiveReview {
  input: CopilotReviewExecutionInput;
  environmentId?: string | null;
  returnPath: string;
}

interface CompletedReview {
  reviewId: string;
  incomplete: boolean;
  botId: string;
  botName: string;
  environmentId?: string | null;
}

function reviewPath(run: ActiveReview, reviewId: string): string {
  const query = buildViewSearchParams(
    run.input.botName,
    reviewId,
    run.environmentId,
  );
  return `/agent-review-tool/copilot/${run.input.botId}?${query}`;
}

function activeReviewPath(run: ActiveReview): string {
  const query = buildRunSearchParams(
    run.input.botName,
    run.input.componentIdUnique,
    run.input.orgUrl,
    run.environmentId,
    run.input.agentVersion,
  );
  return `/agent-review-tool/copilot/${run.input.botId}?${query}`;
}

function isSameReview(
  current: ActiveReview,
  next: CopilotReviewExecutionInput,
): boolean {
  return current.input.botId === next.botId
    && current.input.componentIdUnique === next.componentIdUnique
    && current.input.orgUrl === next.orgUrl;
}

export interface CopilotReviewRunnerProviderProps {
  children: ReactNode;
}

/**
 * Owns a Copilot review above route content so navigation cannot stop result
 * assembly or persistence.
 */
export function CopilotReviewRunnerProvider({
  children,
}: CopilotReviewRunnerProviderProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);
  const activeReviewRef = useRef<ActiveReview | null>(null);
  const recoveryRef = useRef<CopilotReviewRecovery | null>(null);
  const restoreGenerationRef = useRef(0);
  const executionInFlightRef = useRef(false);
  const executionGenerationRef = useRef(0);
  const furthestStageRef = useRef(-1);
  const watchingRef = useRef(false);
  const backgroundFocusTarget = useRestoreFocusTarget();
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [completed, setCompleted] = useState<CompletedReview | null>(null);
  const [progress, setProgress] = useState<SkillReviewProgress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);
  const [restoreError, setRestoreError] = useState<Error | null>(null);

  const handleProgress = useCallback((next: SkillReviewProgress) => {
    const rank = stageRank(next.stage);
    setProgress((previous) => {
      if (rank >= furthestStageRef.current) {
        furthestStageRef.current = rank;
        return next;
      }
      return previous ? { ...next, stage: previous.stage } : next;
    });
  }, []);

  const handleJobSubmitted = useCallback((jobId: string) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    const updated = { ...recovery, jobId };
    recoveryRef.current = updated;
    writeCopilotReviewRecovery(updated);
  }, []);

  const mutation = useCopilotReviewMutation({
    onProgress: handleProgress,
    getAbortSignal: () => abortRef.current?.signal,
    onJobSubmitted: handleJobSubmitted,
  });
  const mutationRef = useRef(mutation);
  useEffect(() => {
    mutationRef.current = mutation;
  }, [mutation]);

  const clearActiveReview = useCallback(() => {
    activeReviewRef.current = null;
    abortRef.current = null;
    executionInFlightRef.current = false;
    furthestStageRef.current = -1;
    setActiveReview(null);
    setProgress(null);
    setStartedAt(null);
    recoveryRef.current = null;
  }, []);

  const setWatchingState = useCallback((next: boolean) => {
    watchingRef.current = next;
    setWatching(next);
  }, []);

  const focusMainAfterRender = useCallback(
    () => {
      const source = document.activeElement;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const activeElement = document.activeElement;
          const focusMovedElsewhere = activeElement !== source
            && activeElement instanceof HTMLElement
            && activeElement !== document.body
            && activeElement.isConnected;
          if (!focusMovedElsewhere) {
            document.querySelector<HTMLElement>('main')?.focus();
          }
        });
      });
    },
    [],
  );

  const start = useCallback(
    (
      input: CopilotReviewExecutionInput,
      options: CopilotReviewStartOptions = {},
    ) => {
      const current = activeReviewRef.current;
      if (executionInFlightRef.current && current) {
        setWatchingState(true);
        if (!isSameReview(current, input)) {
          navigate(activeReviewPath(current), { replace: true });
        }
        return;
      }

      logReviewStarted();

      restoreGenerationRef.current += 1;
      const runStartedAt = Date.now();
      const executionInput: CopilotReviewExecutionInput = {
        ...input,
        existingJobId: undefined,
        startedAt: new Date(runStartedAt).toISOString(),
      };
      const run: ActiveReview = {
        input: executionInput,
        environmentId: options.environmentId,
        returnPath: options.returnPath ?? DEFAULT_RETURN_PATH,
      };
      const recovery = createCopilotReviewRecovery(
        executionInput,
        run.environmentId,
        run.returnPath,
        runStartedAt,
      );

      mutation.reset();
      setRestoreError(null);
      setCompleted((previous) =>
        previous?.botId === input.botId ? null : previous);
      setProgress(null);
      furthestStageRef.current = -1;
      abortRef.current = new AbortController();
      activeReviewRef.current = run;
      recoveryRef.current = recovery;
      if (recovery) writeCopilotReviewRecovery(recovery);
      setActiveReview(run);
      setStartedAt(runStartedAt);
      setWatchingState(true);
      executionInFlightRef.current = true;
      const executionGeneration = ++executionGenerationRef.current;
      mutation.mutate(executionInput, {
        onSettled: () => {
          if (executionGeneration === executionGenerationRef.current) {
            executionInFlightRef.current = false;
          }
        },
      });
    },
    [mutation, navigate, setWatchingState],
  );

  const reset = useCallback(() => {
    restoreGenerationRef.current += 1;
    executionGenerationRef.current += 1;
    executionInFlightRef.current = false;
    mutation.reset();
    clearCopilotReviewRecovery();
    clearActiveReview();
    setRestoreError(null);
    setWatchingState(false);
  }, [clearActiveReview, mutation, setWatchingState]);

  const sendToBackground = useCallback(() => {
    const returnPath = activeReviewRef.current?.returnPath ?? DEFAULT_RETURN_PATH;
    setWatchingState(false);
    navigate(returnPath);
  }, [navigate, setWatchingState]);

  const watch = useCallback(() => {
    setWatchingState(true);
  }, [setWatchingState]);

  const cancel = useCallback(() => {
    const returnPath = activeReviewRef.current?.returnPath ?? DEFAULT_RETURN_PATH;
    abortRef.current?.abort();
    reset();
    navigate(returnPath, { replace: true });
    focusMainAfterRender();
  }, [focusMainAfterRender, navigate, reset]);

  const closeErrorDialog = useCallback(() => {
    const returnPath = activeReviewRef.current?.returnPath ?? DEFAULT_RETURN_PATH;
    setWatchingState(false);
    navigate(returnPath, { replace: true });
  }, [navigate, setWatchingState]);

  const dismiss = useCallback(() => {
    const returnPath = activeReviewRef.current?.returnPath ?? DEFAULT_RETURN_PATH;
    reset();
    navigate(returnPath, { replace: true });
    focusMainAfterRender();
  }, [focusMainAfterRender, navigate, reset]);

  const retry = useCallback(() => {
    const run = activeReviewRef.current;
    if (!run) return;
    start({
      botId: run.input.botId,
      botName: run.input.botName,
      componentIdUnique: run.input.componentIdUnique,
      orgUrl: run.input.orgUrl,
      sourceEnvironment: run.input.sourceEnvironment,
      zipData: run.input.zipData,
    }, {
      environmentId: run.environmentId,
      returnPath: run.returnPath,
    });
  }, [start]);

  const openCompleted = useCallback(() => {
    if (!completed) return;
    const query = buildViewSearchParams(
      completed.botName,
      completed.reviewId,
      completed.environmentId,
    );
    const path = `/agent-review-tool/copilot/${completed.botId}?${query}`;
    setCompleted(null);
    navigate(path);
    focusMainAfterRender();
  }, [completed, focusMainAfterRender, navigate]);

  const dismissCompleted = useCallback(() => {
    setCompleted(null);
    focusMainAfterRender();
  }, [focusMainAfterRender]);

  useEffect(() => {
    if (!mutation.isSuccess || !mutation.data) return;
    const run = activeReviewRef.current;
    if (!run) return;

    const wasWatching = watchingRef.current;
    const reviewId = mutation.data.reviewId;
    clearCopilotReviewRecovery();
    clearActiveReview();
    setWatchingState(false);
    mutation.reset();

    if (!reviewId) {
      navigate(run.returnPath, { replace: true });
      focusMainAfterRender();
      return;
    }

    if (wasWatching) {
      navigate(reviewPath(run, reviewId), { replace: true });
      focusMainAfterRender();
      return;
    }

    setCompleted({
      reviewId,
      incomplete: mutation.data.status === 'failed',
      botId: run.input.botId,
      botName: run.input.botName,
      environmentId: run.environmentId,
    });
  }, [
    clearActiveReview,
    focusMainAfterRender,
    mutation,
    navigate,
    setWatchingState,
  ]);

  useEffect(() => {
    const storedRecovery = readCopilotReviewRecovery();
    if (!storedRecovery) return;

    let disposed = false;
    const restoreGeneration = restoreGenerationRef.current;
    const restore = async () => {
      await Promise.resolve();
      if (
        disposed
        || restoreGeneration !== restoreGenerationRef.current
        || activeReviewRef.current
      ) return;

      let recovery = storedRecovery;
      if (!recovery.jobId) {
        try {
          const job = await findLatestJobForBot(
            recovery.input.botId,
            new Date(recovery.startedAt),
          );
          if (job?.cat_agentreviewjobid) {
            recovery = {
              ...recovery,
              jobId: job.cat_agentreviewjobid,
            };
            writeCopilotReviewRecovery(recovery);
          }
        } catch (error) {
          if (
            disposed
            || restoreGeneration !== restoreGenerationRef.current
            || activeReviewRef.current
          ) return;
          const message = error instanceof Error ? error.message : String(error);
          const run: ActiveReview = {
            input: {
              ...recovery.input,
              startedAt: new Date(recovery.startedAt).toISOString(),
            },
            environmentId: recovery.environmentId,
            returnPath: recovery.returnPath,
          };
          activeReviewRef.current = run;
          recoveryRef.current = recovery;
          setActiveReview(run);
          setStartedAt(recovery.startedAt);
          setRestoreError(
            new Error(`The saved review could not be restored: ${message}`),
          );
          return;
        }
      }

      if (
        disposed
        || restoreGeneration !== restoreGenerationRef.current
        || activeReviewRef.current
      ) return;
      const input: CopilotReviewExecutionInput = {
        ...recovery.input,
        existingJobId: recovery.jobId,
        startedAt: new Date(recovery.startedAt).toISOString(),
      };
      const run: ActiveReview = {
        input,
        environmentId: recovery.environmentId,
        returnPath: recovery.returnPath,
      };

      recoveryRef.current = recovery;
      activeReviewRef.current = run;
      furthestStageRef.current = -1;
      watchingRef.current = false;
      abortRef.current = new AbortController();
      setActiveReview(run);
      setProgress(null);
      setStartedAt(recovery.startedAt);
      setWatching(false);
      setRestoreError(null);
      mutationRef.current.reset();
      executionInFlightRef.current = true;
      const executionGeneration = ++executionGenerationRef.current;
      mutationRef.current.mutate(input, {
        onSettled: () => {
          if (executionGeneration === executionGenerationRef.current) {
            executionInFlightRef.current = false;
          }
        },
      });
    };

    void restore();
    return () => {
      disposed = true;
    };
  }, []);

  const isRunning = mutation.isPending;
  const rawError = mutation.error ?? restoreError;
  const classifiedError = useMemo(() => {
    if (!rawError) return null;

    const classified = classifyAIError(rawError);
    if (/Agent Node did not respond within five minutes/i.test(rawError.message)) {
      return {
        ...classified,
        title: 'Agent Node timed out',
        message: rawError.message,
        canRetry: true,
      };
    }

    if (rawError instanceof ReviewJobError && rawError.code === 'capacity') {
      return { ...classified, canRetry: false };
    }

    return classified;
  }, [rawError]);
  const hasError = classifiedError !== null;
  const errorMessage = classifiedError?.message ?? null;
  const backgroundAnnouncement = [
    isRunning && !watching && activeReview
      ? `Reviewing ${activeReview.input.botName}.`
      : '',
    hasError && !watching && activeReview
      ? `Review failed for ${activeReview.input.botName}.`
      : '',
    completed
      ? `${completed.incomplete ? 'Review incomplete' : 'Review ready'} for ${completed.botName}.`
      : '',
  ].filter(Boolean).join(' ');

  const value = useMemo<CopilotReviewRunnerValue>(
    () => ({
      mutation,
      progress,
      startedAt,
      watching,
      isRunning,
      start,
      reset,
      sendToBackground,
      watch,
    }),
    [
      mutation,
      progress,
      startedAt,
      watching,
      isRunning,
      start,
      reset,
      sendToBackground,
      watch,
    ],
  );

  return (
    <CopilotReviewRunnerContext.Provider value={value}>
      {children}

      <div className={styles.visuallyHidden} role="status" aria-live="polite">
        {backgroundAnnouncement}
      </div>

      <CopilotReviewProgressDialog
        key={activeReview
          ? `${activeReview.input.botId}:${activeReview.input.componentIdUnique}:${startedAt}`
          : 'idle'}
        open={watching && (isRunning || hasError)}
        agentName={activeReview?.input.botName ?? 'Agent'}
        progress={progress}
        isCancelling={false}
        error={errorMessage}
        errorTitle={classifiedError?.title}
        canRetry={classifiedError?.canRetry ?? true}
        learnMoreUrl={classifiedError?.learnMoreUrl}
        technicalDetail={classifiedError?.technicalDetail}
        onCancel={cancel}
        onRetry={retry}
        onClose={closeErrorDialog}
        onContinueInBackground={isRunning ? sendToBackground : undefined}
        startedAt={startedAt}
      />

      {isRunning && !watching && activeReview && (
        <ReviewBackgroundBadge announce={false}>
          <Spinner size="tiny" aria-label="Review in progress" />
          <Text size={200} weight="semibold" className={styles.label}>
            Reviewing
          </Text>
          <Text
            size={200}
            className={styles.name}
            title={activeReview.input.botName}
          >
            {activeReview.input.botName}
          </Text>
          <Button
            {...backgroundFocusTarget}
            size="small"
            appearance="subtle"
            aria-label={`View progress for ${activeReview.input.botName}`}
            onClick={watch}
          >
            View progress
          </Button>
        </ReviewBackgroundBadge>
      )}

      {hasError && !watching && activeReview && (
        <ReviewBackgroundBadge announce={false}>
          <ErrorCircleFilled className={styles.failed} />
          <Text size={200} weight="semibold" className={styles.label}>
            Review failed
          </Text>
          <Text
            size={200}
            className={styles.name}
            title={activeReview.input.botName}
          >
            {activeReview.input.botName}
          </Text>
          <Button
            {...backgroundFocusTarget}
            size="small"
            appearance="subtle"
            aria-label={`View error for ${activeReview.input.botName}`}
            onClick={watch}
          >
            View error
          </Button>
          <Button
            size="small"
            appearance="subtle"
            icon={<DismissRegular />}
            aria-label="Dismiss failed review"
            onClick={dismiss}
          />
        </ReviewBackgroundBadge>
      )}

      {completed && (
        <ReviewBackgroundBadge announce={false}>
          {completed.incomplete
            ? <ErrorCircleFilled className={styles.failed} />
            : <CheckmarkCircleFilled className={styles.ready} />}
          <Text size={200} weight="semibold" className={styles.label}>
            {completed.incomplete ? 'Review incomplete' : 'Review ready'}
          </Text>
          <Text size={200} className={styles.name} title={completed.botName}>
            {completed.botName}
          </Text>
          <Button
            size="small"
            appearance="primary"
            icon={<OpenRegular />}
            aria-label={`Open review for ${completed.botName}`}
            onClick={openCompleted}
          >
            Open
          </Button>
          <Button
            size="small"
            appearance="subtle"
            icon={<DismissRegular />}
            aria-label="Dismiss completed review"
            onClick={dismissCompleted}
          />
        </ReviewBackgroundBadge>
      )}
    </CopilotReviewRunnerContext.Provider>
  );
}
