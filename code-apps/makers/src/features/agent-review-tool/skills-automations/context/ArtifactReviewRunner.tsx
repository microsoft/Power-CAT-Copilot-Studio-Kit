/**
 * ArtifactReviewRunner
 *
 * Holds one skills-and-automations review for the whole application, not for
 * one tab.
 *
 * The review used to live inside `SkillsAutomationsPanel`. That panel is
 * rendered conditionally on the active tab, so switching to another review tab
 * — or opening the Agent Debugger — unmounted it, and the unmount guard in
 * `useArtifactReview` aborted the run. A review that had already cost a real AI
 * call was destroyed silently, with no warning and no way to get it back.
 *
 * Mounting the runner above the router fixes that at the root: nothing the user
 * does inside the app can unmount it, so a review survives every tab change and
 * every navigation. The panel now reads this context instead of owning state.
 *
 * Two further duties moved here with the state, because both must keep working
 * when the panel is not on screen:
 *
 *  - Saving the finished review. The write is the only step that turns a paid
 *    AI call into a durable record, so it cannot depend on a component being
 *    mounted.
 *  - Telling the user the review is ready. When the reader is still watching
 *    the dialog they are taken to the result, as before. When they have moved
 *    on, a badge reports it instead of stealing the screen from them.
 *
 * What this does *not* do is survive the browser closing. The workflow itself
 * runs in Power Automate and finishes regardless, but the assembly step is
 * client-side, so a closed tab still loses the record. That is the separate
 * durable-row change, and this provider is the seam it will hook into.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
  OpenRegular,
} from '@fluentui/react-icons';
import type {
  ArtifactReviewResult,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { ReviewBackgroundBadge } from '../../components/ReviewBackgroundBadge';
import { artifactHistoryQueryKey } from '../hooks/useArtifactHistory';
import { useArtifactReview } from '../hooks/useArtifactReview';
import { logReviewStarted } from '../../utils/reviewTelemetry';
import { skillsReviewPath } from '../routes';
import {
  ArtifactReviewRunnerContext,
  type ArtifactReviewRunnerValue,
} from './artifactReviewRunnerContext';
import {
  claimActiveReview,
  deleteArtifactReview,
  keyForResult,
  releaseActiveReview,
  saveArtifactReview,
} from '../services/artifactReviewStore';

const useStyles = makeStyles({
  label: { color: tokens.colorNeutralForeground1 },
  name: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '180px',
  },
  ready: { color: tokens.colorPaletteGreenForeground1, flexShrink: 0 },
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

/**
 * A review that finished while the reader was elsewhere in the app.
 *
 * Held rather than announced through a toast: a toast times out, and the whole
 * point of the background mode is that the reader may be away from the screen
 * when the run lands.
 */
interface CompletedReview {
  reviewId: string;
  artifactName: string;
  result: ArtifactReviewResult;
}

export interface ArtifactReviewRunnerProviderProps {
  children: ReactNode;
}

export function ArtifactReviewRunnerProvider({ children }: ArtifactReviewRunnerProviderProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const progressFocusTarget = useRestoreFocusTarget();

  // Identity of the row reserved for the run in flight, so a discard can remove
  // it and a failure can mark it stopped. Held in a ref because nothing renders
  // it and a re-render on every reservation would be noise.
  const reservedIdRef = useRef<string | null>(null);
  const reservedResultRef = useRef<ArtifactReviewResult | null>(null);

  /**
   * Announce the review before the AI stage runs.
   *
   * This is the write that makes a review survive the browser closing. It runs
   * once per review, at the point the pipeline has finished everything
   * deterministic and is about to spend minutes in the AI stage.
   *
   * The history query is invalidated straight away so the grid shows the run
   * as soon as it starts, rather than only once it ends.
   */
  const handleReserve = useCallback(
    async (reserved: ArtifactReviewResult) => {
      const reviewId = await saveArtifactReview(reserved);
      reservedIdRef.current = reviewId;
      reservedResultRef.current = reserved;
      // This browser is completing the row, so the history sweep must not also
      // collect it and settle the same review twice.
      if (reviewId) claimActiveReview(reviewId);
      void queryClient.invalidateQueries({ queryKey: artifactHistoryQueryKey });
    },
    [queryClient],
  );

  const review = useArtifactReview({ onReserve: handleReserve });

  const [watching, setWatching] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedReview | null>(null);

  // Read inside the save effect, which must not re-run when the reader merely
  // opens or closes the dialog — that would repeat the write.
  const watchingRef = useRef(watching);
  useEffect(() => {
    watchingRef.current = watching;
  }, [watching]);

  const isRunning = review.phase === 'reading' || review.phase === 'reviewing';

  const { start: startReview, reset: resetReview, cancel: cancelReview } = review;

  // Guards the save against an effect that re-runs on an unrelated render and
  // writes the same review twice.
  const savedKeyRef = useRef<string | null>(null);

  /**
   * Hand the reserved row back.
   *
   * Called wherever this browser stops being responsible for the row, whether
   * it completed it, failed it, or abandoned it. Releasing the claim is what
   * lets the history sweep pick the row up again, so a run that ends without
   * writing a result is still resolved on a later visit rather than stranded.
   */
  const clearReservation = useCallback(() => {
    if (reservedIdRef.current) releaseActiveReview(reservedIdRef.current);
    reservedIdRef.current = null;
    reservedResultRef.current = null;
  }, []);

  const start = useCallback(
    async (file: File, runtimes: TargetRuntime[], preparedArtifact?: UploadedArtifact) => {
      // A new run always deserves a save, including a deliberate re-review of
      // bytes already on file, which produces the same key as the last one.
      savedKeyRef.current = null;
      logReviewStarted();
      clearReservation();
      setSaveError(null);
      setCompleted(null);
      setWatching(true);
      await startReview(file, runtimes, preparedArtifact);
    },
    [clearReservation, startReview],
  );

  const reset = useCallback(() => {
    savedKeyRef.current = null;
    setSaveError(null);
    setWatching(false);
    resetReview();
  }, [resetReview]);

  /**
   * Clear the run and remove any row it reserved.
   *
   * The dialog no longer offers to discard a review in flight — once a review
   * starts it runs to completion, and saying otherwise would claim to stop work
   * that carries on regardless. What reaches here is the reader closing a
   * *failed* run, where the reservation has usually been marked failed already
   * and there is nothing left to remove.
   *
   * The deletion stays for the case where it has not: a reserved row with no
   * run behind it reads as "still running" for ever. It is guarded, so on the
   * ordinary path it does nothing.
   */
  const cancel = useCallback(() => {
    savedKeyRef.current = null;
    setWatching(false);
    cancelReview();

    const reservedId = reservedIdRef.current;
    clearReservation();
    if (!reservedId) return;

    void (async () => {
      try {
        await deleteArtifactReview(reservedId);
      } catch {
        // A row left behind reads as "still running" and is resolved by the
        // sweep on the next visit. Reporting it here would put an error in
        // front of a reader who has already moved on.
      }
      void queryClient.invalidateQueries({ queryKey: artifactHistoryQueryKey });
    })();
  }, [cancelReview, clearReservation, queryClient]);

  const sendToBackground = useCallback(() => setWatching(false), []);
  const watch = useCallback(() => setWatching(true), []);

  const openCompleted = useCallback(() => {
    if (!completed) return;
    const { reviewId, result } = completed;
    setCompleted(null);
    reset();
    navigate(skillsReviewPath(reviewId), { state: { result } });
  }, [completed, navigate, reset]);

  // Store the finished review, then either hand the reader over to it or report
  // that it is waiting. Both paths must work with the panel unmounted, which is
  // why neither lives in the panel any more.
  useEffect(() => {
    if (review.phase !== 'results' || !review.result) return;
    const result = review.result;
    const key = keyForResult(result);
    if (savedKeyRef.current === key) return;
    savedKeyRef.current = key;

    const wasWatching = watchingRef.current;
    const artifactName = review.artifactName;
    // The completion below upserts onto the reserved row, so the reservation is
    // discharged from here on and must not be deleted or marked failed later.
    clearReservation();

    void (async () => {
      let reviewId: string | null = null;
      try {
        reviewId = await saveArtifactReview(result);
        setSaveError(null);
        void queryClient.invalidateQueries({ queryKey: artifactHistoryQueryKey });
      } catch (caught) {
        setSaveError(
          caught instanceof Error && caught.message
            ? caught.message
            : 'The review could not be saved to your environment.',
        );
      }

      // Nothing to address. The result stays in state so the panel can show it
      // rather than lose a review that has already been paid for.
      if (!reviewId) {
        setWatching(false);
        return;
      }

      if (wasWatching) {
        // The reader chose to wait, so take them straight to the result. The
        // runner is cleared because the page reads the result from router
        // state; leaving it set would show a stale result on the tab later.
        reset();
        navigate(skillsReviewPath(reviewId), { state: { result } });
        return;
      }

      // The reader moved on. Say it is ready and let them choose when to look.
      setCompleted({ reviewId, artifactName, result });
      resetReview();
    })();
  }, [
    review.phase,
    review.result,
    review.artifactName,
    clearReservation,
    navigate,
    queryClient,
    reset,
    resetReview,
  ]);

  /**
   * Close off a reserved row when the run failed on the client.
   *
   * Without this the row stays `in-progress` for ever and the grid keeps
   * offering to show progress on something that stopped. Marking it failed is
   * not a verdict on the artifact — the row explicitly says the review did not
   * finish, and offers to run it again.
   */
  useEffect(() => {
    if (review.phase !== 'error') return;

    const reservedId = reservedIdRef.current;
    const reserved = reservedResultRef.current;
    clearReservation();
    if (!reservedId || !reserved) return;

    const message = review.error;

    void (async () => {
      try {
        // Upserts onto the reserved row: the key is unchanged, so this
        // replaces the running record rather than adding a second one.
        await saveArtifactReview({
          ...reserved,
          status: 'failed',
          reviewedAt: new Date().toISOString(),
          error: message ?? 'The review did not finish.',
        });
      } catch {
        // Left running. The sweep on the next visit resolves it, and a stale
        // running row is a smaller problem than an error the reader cannot act
        // on while they are looking at a different failure already.
      }
      void queryClient.invalidateQueries({ queryKey: artifactHistoryQueryKey });
    })();
  }, [review.phase, review.error, clearReservation, queryClient]);

  const value = useMemo<ArtifactReviewRunnerValue>(
    () => ({
      ...review,
      start,
      reset,
      cancel,
      watching,
      isRunning,
      sendToBackground,
      watch,
      saveError,
    }),
    [review, start, reset, cancel, watching, isRunning, sendToBackground, watch, saveError],
  );
  const backgroundAnnouncement = [
    isRunning && !watching ? `Reviewing ${review.artifactName}.` : '',
    completed ? `Review ready for ${completed.artifactName}.` : '',
  ].filter(Boolean).join(' ');

  return (
    <ArtifactReviewRunnerContext.Provider value={value}>
      {children}

      <div className={styles.visuallyHidden} role="status" aria-live="polite">
        {backgroundAnnouncement}
      </div>

      {isRunning && !watching && (
        <ReviewBackgroundBadge announce={false}>
          <Spinner size="tiny" aria-label="Review in progress" />
          <Text size={200} weight="semibold" className={styles.label}>
            Reviewing
          </Text>
          <Text size={200} className={styles.name} title={review.artifactName}>
            {review.artifactName}
          </Text>
          <Button
            {...progressFocusTarget}
            size="small"
            appearance="subtle"
            aria-label={`View progress for ${review.artifactName}`}
            onClick={watch}
          >
            View progress
          </Button>
        </ReviewBackgroundBadge>
      )}

      {completed && (
        <ReviewBackgroundBadge announce={false}>
          <CheckmarkCircleFilled className={styles.ready} />
          <Text size={200} weight="semibold" className={styles.label}>
            Review ready
          </Text>
          <Text size={200} className={styles.name} title={completed.artifactName}>
            {completed.artifactName}
          </Text>
          <Button size="small" appearance="primary" icon={<OpenRegular />} onClick={openCompleted}>
            Open
          </Button>
          <Button
            size="small"
            appearance="subtle"
            icon={<DismissRegular />}
            aria-label="Dismiss"
            onClick={() => setCompleted(null)}
          />
        </ReviewBackgroundBadge>
      )}
    </ArtifactReviewRunnerContext.Provider>
  );
}
