/**
 * useDAReviewMutation Hook
 *
 * Orchestrates the full DA review pipeline:
 *   Stage A (local): manifest and package validation
 *   Stage B:         workflow or existing AI evaluation
 *   Score:           calculateDAScore
 *   Save:            upsertDAReview
 *
 * Exposes { runReview, isRunning, progress, error } to the caller.
 * Invalidates daReviews.all query on success.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DAManifest } from '../contracts/DAManifest';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type {
  DAEvidenceRecord,
  DAPackageEvidence,
  DAPackageValidation,
} from '../contracts/DAPackageReview';
import type { ManifestHealthCheck } from '../contracts/ManifestHealthCheck';
import type { DAWorkflowRequest } from '../contracts/DAWorkflowReview';
import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import { runManifestHealthCheck } from '../utils/manifestHealthCheck';
import { evaluateDA } from '../services/DAEvaluationService';
import {
  evaluateDAWorkflowRequest,
  type DAWorkflowTransport,
} from '../services/DAWorkflowEvaluationService';
import { buildDAWorkflowRequest } from '../services/DAWorkflowContractService';
import { executeDAReviewJob } from '../services/DAReviewJobService';
import { calculateDAScore } from '../utils/scoreCalculator';
import { applyDAEvaluationApplicability } from '../utils/evaluationApplicability';
import { runDAPackageValidation } from '../utils/packageValidation';
import { upsertDAReview } from '../services/DAReviewService';
import { getDAIdentifier } from '../utils/daIdGenerator';
import { daQueryKeys } from './queryKeys';
import { reviewDACustomSkills } from '../services/DAAgentSkillReviewService';

export interface DAReviewProgress {
  stage:
    | 'parsing'
    | 'health-check'
    | 'skill-evaluation'
    | 'ai-evaluation'
    | 'saving'
    | 'complete';
  label: string;
}

export interface DAReviewExecutionInput {
  manifest: DAManifest;
  packageEvidence?: DAPackageEvidence;
  sourceType: 'zip' | 'graph-api';
  orgUrl?: string;
  /** Immutable request retained when a durable job is resumed. */
  workflowRequest?: DAWorkflowRequest;
  /** Existing durable job to collect instead of submitting another one. */
  existingJobId?: string;
  /** Stable correlation ID allocated before the durable request is built. */
  correlationId?: string;
  /** Stable identifier calculated before the browser recovery snapshot is saved. */
  componentIdUnique?: string;
  /** Precomputed deterministic results retained for restart recovery. */
  manifestHealth?: ManifestHealthCheck;
  packageValidation?: DAPackageValidation;
  retainedEvidence?: DAEvidenceRecord[];
  /** Transient package content. Never persisted directly. */
  skillBundles?: SkillBundle[];
  /** Stable per-run cancellation signal. Never persisted. */
  abortSignal?: AbortSignal;
  /** Sanitized custom-skill results retained for restart recovery. */
  customSkillReviews?: DAReviewRecord['customSkillReviews'];
  customSkillOrchestration?: DAReviewRecord['customSkillOrchestration'];
  customSkillIssues?: DAReviewRecord['customSkillIssues'];
}

export interface DAPreparedReviewInput {
  manifest: DAManifest;
  sourceType: 'zip' | 'graph-api';
  orgUrl?: string;
  workflowRequest: DAWorkflowRequest;
  componentIdUnique: string;
  manifestHealth: ManifestHealthCheck;
  packageValidation?: DAPackageValidation;
  retainedEvidence: DAEvidenceRecord[];
  customSkillReviews?: DAReviewRecord['customSkillReviews'];
  customSkillOrchestration?: DAReviewRecord['customSkillOrchestration'];
  customSkillIssues?: DAReviewRecord['customSkillIssues'];
}

interface UseDAReviewMutationResult {
  /** Start the DA review pipeline */
  runReview: (input: DAReviewExecutionInput) => Promise<DAReviewRecord>;
  /** Whether review is in progress */
  isRunning: boolean;
  /** Current pipeline stage label */
  progress: DAReviewProgress | null;
  /** Error if review failed */
  error: Error | null;
  /** Reset error state */
  reset: () => void;
}

export interface UseDAReviewMutationOptions {
  /** Optional transport override for tests or an alternate workflow host. */
  workflowTransport?: DAWorkflowTransport;
  /** Receives the restart-safe snapshot before a durable job is submitted. */
  onPrepared?: (input: DAPreparedReviewInput) => void;
  /** Receives the durable Dataverse job ID as soon as it is known. */
  onJobSubmitted?: (jobId: string) => void;
  /** Supplies cancellation to the durable poller. */
  getAbortSignal?: () => AbortSignal | undefined;
}

export interface DAReviewPipelineOptions extends UseDAReviewMutationOptions {
  /** Stable correlation ID allocated by the application-level runner. */
  correlationId?: string;
  /** Durable job ID to collect after a browser restart. */
  existingJobId?: string;
  /** Reports pipeline and workflow polling progress. */
  onProgress?: (progress: DAReviewProgress) => void;
  /** Direct cancellation signal for non-React callers and tests. */
  signal?: AbortSignal;
}

/**
 * Runs one Declarative Agent review from deterministic checks through durable
 * workflow evaluation and final persistence.
 */
export async function executeDAReviewPipeline(
  input: DAReviewExecutionInput,
  options: DAReviewPipelineOptions = {},
): Promise<DAReviewRecord> {
  const { manifest, packageEvidence, sourceType, orgUrl } = input;
  const report = options.onProgress ?? (() => undefined);
  const signal = options.signal ?? input.abortSignal ?? options.getAbortSignal?.();
  signal?.throwIfAborted();
  if (!(options.existingJobId ?? input.existingJobId)
    && (input.workflowRequest || packageEvidence) && !options.workflowTransport) {
    const { assertReviewWorkflowAvailable } = await import('../../services/ReviewWorkflowAvailabilityService');
    await assertReviewWorkflowAvailable(signal);
  }

  report({ stage: 'health-check', label: 'Checking manifest health...' });
  const manifestHealth = input.manifestHealth ?? runManifestHealthCheck(manifest);
  const packageValidation = input.packageValidation ?? (
    packageEvidence
      ? runDAPackageValidation(manifest, packageEvidence, input.skillBundles)
      : undefined
  );
  let customSkillReviews = input.customSkillReviews;
  let customSkillOrchestration = input.customSkillOrchestration;
  let customSkillIssues = input.customSkillIssues;
  if (customSkillReviews === undefined && input.skillBundles?.length) {
    report({
      stage: 'skill-evaluation',
      label: 'Evaluating custom skills...',
    });
    const customSkillResult = await reviewDACustomSkills(
      input.skillBundles,
      manifest.instructions,
      {},
      signal,
    );
    signal?.throwIfAborted();
    customSkillReviews = customSkillResult.reviews;
    customSkillOrchestration = customSkillResult.orchestration;
    customSkillIssues = customSkillResult.issues;
  }
  const componentIdUnique = input.componentIdUnique
    ?? await getDAIdentifier(manifest);
  signal?.throwIfAborted();

  const workflowRequest = input.workflowRequest ?? (
    packageEvidence
      ? buildDAWorkflowRequest(manifest, packageEvidence, {
          correlationId:
            options.correlationId
            ?? input.correlationId
            ?? crypto.randomUUID(),
        })
      : undefined
  );

  report({ stage: 'ai-evaluation', label: 'Running quality evaluation...' });
  let workflowResult: Awaited<ReturnType<typeof evaluateDAWorkflowRequest>> | undefined;
  if (workflowRequest) {
    signal?.throwIfAborted();
    const retainedEvidence = input.retainedEvidence
      ?? workflowRequest.evidence;
    options.onPrepared?.({
      manifest,
      sourceType,
      ...(orgUrl ? { orgUrl } : {}),
      workflowRequest,
      componentIdUnique,
      manifestHealth,
      packageValidation,
      retainedEvidence,
      customSkillReviews,
      customSkillOrchestration,
      customSkillIssues,
    });

    const transport: DAWorkflowTransport = options.workflowTransport
      ?? ((request) => executeDAReviewJob(request, {
        existingJobId: options.existingJobId ?? input.existingJobId,
        signal,
        onJobSubmitted: options.onJobSubmitted,
        onJobPoll: (row) => {
          report({
            stage: 'ai-evaluation',
            label: row.cat_laststatus?.trim()
              ? `Running quality evaluation: ${row.cat_laststatus}`
              : 'Running quality evaluation...',
          });
        },
      }));

    workflowResult = await evaluateDAWorkflowRequest(
      manifest,
      workflowRequest,
      transport,
    );
    signal?.throwIfAborted();
  }

  const rawEvaluation = workflowResult?.evaluation
    ?? await evaluateDA(manifest, orgUrl);
  signal?.throwIfAborted();
  const evaluation = applyDAEvaluationApplicability(rawEvaluation, manifest);
  const overallScore = calculateDAScore(evaluation);

  report({ stage: 'saving', label: 'Saving results...' });
  const reviewRecord: DAReviewRecord = {
    componentIdUnique,
    agentName: manifest.name || manifest.shortName,
    agentVersion: manifest.appVersion,
    publisherName: manifest.developerName,
    sourceType,
    overallScore,
    iconBase64: manifest.iconBase64,
    manifest,
    manifestHealth,
    evaluation,
    packageValidation,
    evidence: input.retainedEvidence
      ?? packageEvidence?.records
      ?? workflowRequest?.evidence,
    workflowProvenance: workflowResult?.provenance,
    customSkillReviews,
    customSkillOrchestration,
    customSkillIssues,
  };

  const reviewId = await upsertDAReview(reviewRecord);
  signal?.throwIfAborted();
  report({ stage: 'complete', label: 'Review complete!' });
  return { ...reviewRecord, reviewId };
}

/**
 * useDAReviewMutation hook
 *
 * @returns Mutation handler and state for running DA review pipeline
 *
 * @example
 * ```tsx
 * function DAGrid() {
 *   const { runReview, isRunning, progress } = useDAReviewMutation();
 *
 *   const handleReview = async (manifest: DAManifest) => {
 *     const result = await runReview({ manifest, sourceType: 'zip' });
 *     openDialog(result);
 *   };
 * }
 * ```
 */
export function useDAReviewMutation(
  options: UseDAReviewMutationOptions = {},
): UseDAReviewMutationResult {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<DAReviewProgress | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const mutation = useMutation({
    mutationFn: (input: DAReviewExecutionInput) => executeDAReviewPipeline(
      input,
      {
        ...options,
        existingJobId: input.existingJobId,
        onProgress: (next) => {
          if (isMountedRef.current) setProgress(next);
        },
      },
    ),
    onSuccess: () => {
      // Invalidate DA reviews cache so the grid refreshes
      queryClient.invalidateQueries({ queryKey: daQueryKeys.daReviews.all() });
    },
  });

  const runReview = useCallback(
    async (input: DAReviewExecutionInput): Promise<DAReviewRecord> => {
      setProgress({ stage: 'parsing', label: 'Preparing review...' });
      try {
        return await mutation.mutateAsync(input);
      } finally {
        // Keep progress visible briefly, then clear (guard against unmount)
        setTimeout(() => { if (isMountedRef.current) setProgress(null); }, 1500);
      }
    },
    [mutation]
  );

  const reset = useCallback(() => {
    mutation.reset();
    setProgress(null);
  }, [mutation]);

  return {
    runReview,
    isRunning: mutation.isPending,
    progress,
    error: mutation.error as Error | null,
    reset,
  };
}
