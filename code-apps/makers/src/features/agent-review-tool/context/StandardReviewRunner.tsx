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
  FluentProvider,
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
import { ReviewBackgroundBadge } from '../components/ReviewBackgroundBadge';
import { ReviewProgressDialog } from '../components/dialogs/ReviewProgressDialog';
import { initialStandardReviewStages } from '../components/dialogs/standardReviewProgress';
import { copilotStudioReviewLightTheme } from '../agents-experience/components/copilotStudioReviewTheme';
import {
  useReviewMutation,
  type ProgressStage,
  type ReviewExecutionInput,
} from '../hooks/useReviewMutation';
import { classifyStandardReviewError } from '../utils/aiErrorClassifier';
import { logReviewStarted } from '../utils/reviewTelemetry';
import { findLatestJobForBot } from '../agents-experience/services/jobs/ReviewJobService';
import {
  formatStandardReviewScope,
  STANDARD_REVIEW_EXPECTED_LABEL,
  STANDARD_REVIEW_SLOW_AFTER_MS,
  STANDARD_REVIEW_SLOW_NOTE,
} from '../utils/standardReviewTiming';
import {
  clearStandardReviewRecovery,
  createStandardReviewRecovery,
  readStandardReviewRecovery,
  writeStandardReviewRecovery,
  type StandardReviewRecovery,
} from '../services/standardReviewRecovery';
import {
  StandardReviewRunnerContext,
  type StandardReviewRunnerValue,
  type StandardReviewStartOptions,
} from './standardReviewRunnerContext';

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
  input: ReviewExecutionInput;
  environmentId?: string | null;
  returnPath: string;
}

interface CompletedReview {
  reviewId: string;
  botId: string;
  botName: string;
  orgUrl?: string | null;
  sourceEnvironment?: string;
}

function reviewPath(
  review: Pick<
    CompletedReview,
    'reviewId' | 'botId' | 'orgUrl' | 'sourceEnvironment'
  >,
): string {
  const query = new URLSearchParams({ reviewId: review.reviewId });
  if (review.orgUrl) query.set('orgUrl', review.orgUrl);
  if (review.sourceEnvironment === 'zip') {
    query.set('sourceEnvironment', 'zip');
  }
  return `/agent-review-tool/standard/${encodeURIComponent(review.botId)}?${query.toString()}`;
}

function isSameReview(
  current: ActiveReview,
  next: ReviewExecutionInput,
): boolean {
  return current.input.botId === next.botId
    && current.input.componentIdUnique === next.componentIdUnique
    && current.input.orgUrl === next.orgUrl
    && current.input.sourceEnvironment === next.sourceEnvironment;
}

export interface StandardReviewRunnerProviderProps {
  children: ReactNode;
}

/**
 * Owns Standard review execution above route content and restores live
 * workflow jobs after the app restarts.
 */
export function StandardReviewRunnerProvider({
  children,
}: StandardReviewRunnerProviderProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const activeReviewRef = useRef<ActiveReview | null>(null);
  const recoveryRef = useRef<StandardReviewRecovery | null>(null);
  const restoreGenerationRef = useRef(0);
  const executionInFlightRef = useRef(false);
  const executionGenerationRef = useRef(0);
  const watchingRef = useRef(false);
  const backgroundFocusTarget = useRestoreFocusTarget();
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [completed, setCompleted] = useState<CompletedReview | null>(null);
  const [progressStages, setProgressStages] = useState<ProgressStage[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [scopeSummary, setScopeSummary] = useState<string>();
  const [watching, setWatching] = useState(false);
  const [restoreError, setRestoreError] = useState<Error | null>(null);

  const handleJobSubmitted = useCallback((jobId: string) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    const updated = { ...recovery, jobId };
    recoveryRef.current = updated;
    writeStandardReviewRecovery(updated);
  }, []);

  const mutation = useReviewMutation({
    onProgress: setProgressStages,
    onJobSubmitted: handleJobSubmitted,
    onScopeReady: (scope) => setScopeSummary(formatStandardReviewScope(scope)),
  });
  const mutationRef = useRef(mutation);
  useEffect(() => {
    mutationRef.current = mutation;
  }, [mutation]);

  const setWatchingState = useCallback((next: boolean) => {
    watchingRef.current = next;
    setWatching(next);
  }, []);

  const clearActiveReview = useCallback(() => {
    activeReviewRef.current = null;
    recoveryRef.current = null;
    executionInFlightRef.current = false;
    setActiveReview(null);
    setProgressStages([]);
    setStartedAt(null);
    setScopeSummary(undefined);
  }, []);

  const focusMainAfterRender = useCallback(() => {
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
  }, []);

  const start = useCallback((
    input: ReviewExecutionInput,
    options: StandardReviewStartOptions = {},
  ) => {
    const current = activeReviewRef.current;
    if (executionInFlightRef.current && current) {
      setWatchingState(true);
      if (!isSameReview(current, input)) {
        navigate(current.returnPath, { replace: true });
      }
      return;
    }

    logReviewStarted();

    restoreGenerationRef.current += 1;
    const runStartedAt = Date.now();
    const executionInput: ReviewExecutionInput = {
      ...input,
      existingJobId: undefined,
      startedAt: new Date(runStartedAt).toISOString(),
    };
    const run: ActiveReview = {
      input: executionInput,
      environmentId: options.environmentId,
      returnPath: options.returnPath ?? DEFAULT_RETURN_PATH,
    };
    const recovery = createStandardReviewRecovery(
      executionInput,
      run.environmentId,
      run.returnPath,
      runStartedAt,
    );

    mutation.reset();
    setRestoreError(null);
    setCompleted((previous) =>
      previous?.botId === input.botId ? null : previous);
    setProgressStages([]);
    setScopeSummary(undefined);
    activeReviewRef.current = run;
    recoveryRef.current = recovery;
    if (recovery) writeStandardReviewRecovery(recovery);
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
  }, [mutation, navigate, setWatchingState]);

  const reset = useCallback(() => {
    restoreGenerationRef.current += 1;
    executionGenerationRef.current += 1;
    executionInFlightRef.current = false;
    mutation.reset();
    clearStandardReviewRecovery();
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
      zipFile: run.input.zipFile,
      zipBotSchemaName: run.input.zipBotSchemaName,
      iconBase64: run.input.iconBase64,
      sourceEnvironment: run.input.sourceEnvironment,
      agentVersion: run.input.agentVersion,
    }, {
      environmentId: run.environmentId,
      returnPath: run.returnPath,
    });
  }, [start]);

  const openCompleted = useCallback(() => {
    if (!completed) return;
    setCompleted(null);
    navigate(reviewPath(completed));
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
    const reviewId = mutation.data.reviewResult.reviewId;
    clearStandardReviewRecovery();
    clearActiveReview();
    setWatchingState(false);
    mutation.reset();

    if (!reviewId) {
      navigate(run.returnPath, { replace: true });
      focusMainAfterRender();
      return;
    }

    const result = {
      reviewId,
      botId: run.input.botId,
      botName: run.input.botName,
      orgUrl: run.input.orgUrl,
      sourceEnvironment: run.input.sourceEnvironment,
    };
    if (wasWatching) {
      navigate(reviewPath(result), { replace: true });
      focusMainAfterRender();
      return;
    }

    setCompleted(result);
  }, [
    clearActiveReview,
    focusMainAfterRender,
    mutation,
    navigate,
    setWatchingState,
  ]);

  useEffect(() => {
    const storedRecovery = readStandardReviewRecovery();
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
            recovery = { ...recovery, jobId: job.cat_agentreviewjobid };
            writeStandardReviewRecovery(recovery);
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

      const input: ReviewExecutionInput = {
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
      watchingRef.current = false;
      setActiveReview(run);
      setProgressStages([]);
      setScopeSummary(undefined);
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

    const classified = classifyStandardReviewError(rawError);
    if (/Agent Node did not respond within five minutes/i.test(rawError.message)) {
      return {
        ...classified,
        title: 'Agent Node timed out',
        message: rawError.message,
        canRetry: true,
      };
    }
    return classified;
  }, [rawError]);
  const hasError = classifiedError !== null;
  const backgroundAnnouncement = [
    isRunning && !watching && activeReview
      ? `Reviewing ${activeReview.input.botName}.`
      : '',
    hasError && !watching && activeReview
      ? `Review failed for ${activeReview.input.botName}.`
      : '',
    completed ? `Review ready for ${completed.botName}.` : '',
  ].filter(Boolean).join(' ');

  const value = useMemo<StandardReviewRunnerValue>(() => ({
    progressStages,
    startedAt,
    watching,
    isRunning,
    activeBotId: activeReview?.input.botId ?? null,
    start,
    sendToBackground,
    watch,
  }), [
    activeReview?.input.botId,
    isRunning,
    progressStages,
    sendToBackground,
    start,
    startedAt,
    watch,
    watching,
  ]);

  return (
    <StandardReviewRunnerContext.Provider value={value}>
      {children}

      <div
        className={styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {backgroundAnnouncement}
      </div>

      <FluentProvider theme={copilotStudioReviewLightTheme} style={{ display: 'contents' }}>
        <ReviewProgressDialog
          key={activeReview
            ? `${activeReview.input.botId}:${activeReview.input.componentIdUnique}:${startedAt}`
            : 'idle'}
          open={watching && (isRunning || hasError)}
          botName={activeReview?.input.botName ?? 'Agent'}
          stages={progressStages.length ? progressStages : initialStandardReviewStages(hasError)}
          error={classifiedError?.message ?? null}
          errorTitle={classifiedError?.title}
          canRetry={classifiedError?.canRetry ?? true}
          learnMoreUrl={classifiedError?.learnMoreUrl}
          technicalDetail={classifiedError?.technicalDetail}
          onRetry={retry}
          onCancel={closeErrorDialog}
          onContinueInBackground={isRunning ? sendToBackground : undefined}
          titleIconColor={copilotStudioReviewLightTheme.colorBrandForeground1}
          startedAt={startedAt}
          scopeSummary={scopeSummary}
          expectedLabel={STANDARD_REVIEW_EXPECTED_LABEL}
          slowAfterMs={STANDARD_REVIEW_SLOW_AFTER_MS}
          slowNote={STANDARD_REVIEW_SLOW_NOTE}
        />
      </FluentProvider>

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
          <CheckmarkCircleFilled className={styles.ready} />
          <Text size={200} weight="semibold" className={styles.label}>
            Review ready
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
    </StandardReviewRunnerContext.Provider>
  );
}
