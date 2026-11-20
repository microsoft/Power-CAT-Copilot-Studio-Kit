/**
 * useArtifactReview
 *
 * Owns the lifecycle of one review: reading the file, running the pipeline,
 * reporting progress, and holding the result.
 *
 * Cancellation is real rather than cosmetic — the AbortController is passed
 * into the pipeline, and a cancelled review discards its result instead of
 * showing a half-finished score.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArtifactReviewProgress,
  ArtifactReviewResult,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import type { ArtifactReviewDeps } from '../services/artifactReviewService';

export type ArtifactReviewPhase = 'idle' | 'reading' | 'reviewing' | 'results' | 'error';

export interface UseArtifactReviewValue {
  phase: ArtifactReviewPhase;
  progress: ArtifactReviewProgress | null;
  result: ArtifactReviewResult | null;
  artifactName: string;
  error: string | null;
  /**
   * Epoch ms when the current review began, or null when none is running.
   *
   * Exposed so the dialog can show elapsed time. Held here rather than in the
   * dialog because the dialog remounts across stages, which would restart a
   * locally-owned clock and under-report the wait.
   */
  startedAt: number | null;
  start: (file: File, runtimes: TargetRuntime[], preparedArtifact?: UploadedArtifact) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useArtifactReview(overrides: ArtifactReviewDeps = {}): UseArtifactReviewValue {
  const [phase, setPhase] = useState<ArtifactReviewPhase>('idle');
  const [progress, setProgress] = useState<ArtifactReviewProgress | null>(null);
  const [result, setResult] = useState<ArtifactReviewResult | null>(null);
  const [artifactName, setArtifactName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The default `{}` is a new object each render, so memoising on it would
  // rebuild every time. Only `start` reads this, and only after an event.
  const overridesRef = useRef(overrides);
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  // A review that outlives its component would keep polling the workflow and
  // then call setState on an unmounted tree.
  useEffect(() => {
    const ref = abortRef;
    return () => {
      ref.current?.abort();
      ref.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setProgress(null);
    setResult(null);
    setArtifactName('');
    setError(null);
    setStartedAt(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setProgress(null);
    setStartedAt(null);
  }, []);

  const start = useCallback(
    async (file: File, runtimes: TargetRuntime[], preparedArtifact?: UploadedArtifact) => {
      // Without this, a second upload runs alongside the first, and whichever
      // finishes last wins — which may be the review the user replaced.
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setArtifactName(file.name);
      setResult(null);
      setError(null);
      setPhase('reading');
      setStartedAt(Date.now());
      setProgress({ stage: 'reading', percent: 2, message: `Reading ${file.name}` });

      try {
        // Loaded on demand. This hook is mounted for the whole application by
        // `ArtifactReviewRunnerProvider`, so a static import would put the
        // reader, the rule registry and the workflow client into the initial
        // bundle for every page, including the ones that never review a file.
        const [{ readUploadedArtifact }, { createArtifactAiStage }, { reviewArtifact }] =
          await Promise.all([
            import('../services/artifactReader'),
            import('../services/artifactAiStage'),
            import('../services/artifactReviewService'),
          ]);
        if (controller.signal.aborted) return;

        const artifact = preparedArtifact ?? await readUploadedArtifact(file);
        if (controller.signal.aborted) return;

        if (!overridesRef.current.runAiStage) {
          const { assertReviewWorkflowAvailable } = await import('../../services/ReviewWorkflowAvailabilityService');
          await assertReviewWorkflowAvailable(controller.signal);
        }

        setPhase('reviewing');

        // The AI stage runs on the same modern workflow the agent reviews use.
        // A caller may replace it — tests do — but the default is the real
        // backend, so the shipped experience is not quietly deterministic-only.
        const deps: ArtifactReviewDeps = {
          runAiStage: createArtifactAiStage({
            // Merged rather than replacing: the pipeline owns stage and
            // percent, the backend owns the detail within the AI stage. A
            // replace here would reset the stage list to the first entry every
            // time the workflow reported in.
            onStageProgress: (detail) =>
              setProgress((current) =>
                current
                  ? {
                      ...current,
                      message: detail.message,
                      lastCompleted: detail.lastCompleted ?? current.lastCompleted,
                      // A count the backend could not read comes back
                      // undefined. Holding the previous value stops the bar
                      // from dropping back on a single failed poll.
                      completedParts: detail.completedParts ?? current.completedParts,
                      totalParts: detail.totalParts ?? current.totalParts,
                    }
                  : current,
              ),
          }),
          ...overridesRef.current,
        };

        const reviewResult = await reviewArtifact(
          {
            artifact,
            runtimes,
            signal: controller.signal,
            onProgress: (next) => {
              // The pipeline does not know what the AI backend last reported,
              // so carry that field forward instead of letting each stage
              // change blank the line the user is reading.
              if (!controller.signal.aborted) {
                setProgress((current) => ({
                  ...next,
                  lastCompleted: next.lastCompleted ?? current?.lastCompleted,
                }));
              }
            },
          },
          deps,
        );

        // A cancelled review must not surface a score. The user asked it to stop.
        if (controller.signal.aborted) return;

        if (reviewResult.status === 'failed' && !reviewResult.artifactKind) {
          throw new Error(reviewResult.error ?? 'The review could not start.');
        }

        setResult(reviewResult);
        setPhase('results');
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'The file could not be read.');
        setPhase('error');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [],
  );

  return { phase, progress, result, artifactName, error, startedAt, start, cancel, reset };
}
