/**
 * useReviewMutation Hook
 *
 * Orchestrates the complete review pipeline:
 * - Stage A: Local YAML parsing and pattern detection
 * - Stage B: AI pattern evaluation
 * - Stage C: AI instruction compliance evaluation
 *
 * Features:
 * - Progress tracking (6 stages: 0% → 10% → 30% → 60% → 85% → 100%)
 * - Atomic save logic (all-or-nothing)
 * - Cache invalidation for reviews and bots
 * - Comprehensive error handling with retry logic
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { stageAService } from '../services/StageAService';
import { reviewService } from '../services/ReviewService';
import { evaluateStandardReviewWithWorkflow } from '../services/StandardReviewWorkflowService';
import { queryKeys } from './queryKeys';
import { assembleStandardReviewResult } from '../utils/standardReviewAssembly';
import { STANDARD_REVIEW_POLICY_VERSION } from '../utils/reviewAssessment';
import { getReviewSubjectKey } from '../utils/reviewHistory';
import type { ReviewAgentMapTarget, ReviewResult } from '../contracts/ReviewResult';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { ReviewJobStatus, type ReviewJobRow } from '../agents-experience/contracts/ReviewJob';
import { UNCLAIMED_JOB_TIMEOUT_MS } from '../agents-experience/services/jobs/reviewJobPolling';
import { toAgentMapIconDataUrl } from '../agents-experience/services/agent-map/agentMapIconData';
import { tryBuildStandardReviewAssessmentIdentity } from '../utils/standardReviewConsistency';
import { UnsupportedHarnessError } from '../agents-experience/services/detection';

const QUEUED_WORKFLOW_DETAIL =
  'Queued in Dataverse. Waiting for the review workflow to start. You can continue in the background.';

/**
 * Progress stage information
 */
export interface ProgressStage {
  /** Stage name for display */
  stageName: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Stage status */
  status: 'pending' | 'active' | 'completed' | 'error';
  /**
   * Optional live detail for the active stage.
   *
   * The workflow backend spends minutes inside a single stage, so the stage
   * name alone cannot distinguish "working" from "stuck". Carries the
   * last-completed component ping.
   */
  detail?: string;
  /**
   * What executes this stage, when it is worth saying.
   *
   * Set only for stages the Copilot Studio workflow serves. It answers the
   * question a long-running stage actually raises — "why has this sat here for
   * two minutes?" — with "because it is a workflow run in Dataverse, not local
   * compute".
   *
   * Standard pattern and instruction results now come from the same durable
   * Agent node workflow used by the review job service. Declarative reviews
   * set this field only on their AI evaluation, and only when the durable
   * workflow serves it (see `daProgressStages`).
   *
   * Deliberately absent on the stages that run in the browser (loading,
   * downloading, the deterministic rules, saving). Marking those would credit
   * the workflow for the part of the review that is not AI at all, and the
   * deterministic rules are the part this tool is most confident about.
   *
   * Attribution never carries status. The tick, spinner and pending circle do
   * that on every row, so a maker who cannot distinguish the gradient loses
   * nothing.
   */
  attribution?: 'workflow-agent';
}

/**
 * Review execution input
 */
export interface ReviewExecutionInput {
  /** Bot ID to review */
  botId: string;
  /** Bot name */
  botName: string;
  /** Component ID unique (for deduplication) */
  componentIdUnique: string;
  /** Optional org URL for cross-environment review (null = current environment) */
  orgUrl?: string | null;
  /**
   * ZIP file to use as the data source for Stage A (ZIP path).
   * When set, Stage A reads from the ZIP instead of calling Dataverse.
   */
  zipFile?: File;
  /**
   * Bot schema name within the ZIP (e.g. "blank_agent_n18rn").
   * Required when zipFile is provided.
   */
  zipBotSchemaName?: string;
  /**
   * Bot icon as base64 string (from ZIP). Persisted in cat_reviewresultjson
   * so it can be restored on subsequent loads without re-uploading the ZIP.
   */
  iconBase64?: string;

  /**
   * Source environment sentinel written to cat_sourceenvironment at save time.
   * '' = current environment, full org URL = cross-env, 'zip' = ZIP-sourced.
   * Derived by the caller — Dashboard passes orgUrl or 'zip'.
   */
  sourceEnvironment?: string;
  /** Live bot publication captured before review execution. */
  agentVersion?: string;
  /** Durable workflow job to collect instead of submitting duplicate AI work. */
  existingJobId?: string;
  /** Original start time retained across an app restart. */
  startedAt?: string;
}

/**
 * Review execution result with progress tracking
 */
export interface ReviewExecutionResult {
  /** Final review result */
  reviewResult: ReviewResult;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Progress callback function signature
 */
export type ProgressCallback = (stages: ProgressStage[]) => void;

export interface StandardReviewScope {
  topicCount: number;
  toolAndAgentCount: number;
  knowledgeSourceCount: number;
}

/**
 * Hook options
 */
export interface UseReviewMutationOptions {
  /** Progress callback invoked after each stage */
  onProgress?: ProgressCallback;
  /** Reports the durable workflow job ID for app restart recovery. */
  onJobSubmitted?: (jobId: string) => void;
  /** Reports the measured Stage A scope used by the duration estimate. */
  onScopeReady?: (scope: StandardReviewScope) => void;
}

/**
 * Execute full review pipeline with progress tracking
 *
 * @param input - Review execution input
 * @param onProgress - Optional progress callback
 * @returns Complete review result
 */
export async function executeReviewPipeline(
  input: ReviewExecutionInput,
  onProgress?: ProgressCallback,
  onJobSubmitted?: (jobId: string) => void,
  onScopeReady?: (scope: StandardReviewScope) => void,
): Promise<ReviewExecutionResult> {
  const startTime = Date.now();

  // Initialize progress stages
  const stages: ProgressStage[] = [
    { stageName: 'Initializing', progress: 0, status: 'active' },
    { stageName: 'Parsing Configuration', progress: 10, status: 'pending' },
    {
      stageName: 'Evaluating Patterns',
      progress: 30,
      status: 'pending',
      attribution: 'workflow-agent',
    },
    {
      stageName: 'Checking Compliance',
      progress: 60,
      status: 'pending',
      attribution: 'workflow-agent',
    },
    { stageName: 'Saving Results', progress: 85, status: 'pending' },
    { stageName: 'Complete', progress: 100, status: 'pending' },
  ];

  const updateProgress = (stageIndex: number, status: 'active' | 'completed' | 'error') => {
    stages[stageIndex].status = status;
    if (stageIndex > 0) {
      stages[stageIndex - 1].status = 'completed';
    }
    if (onProgress) {
      onProgress([...stages]);
    }
  };

  const updateWorkflowPollingProgress = (row: ReviewJobRow, elapsedMs: number) => {
    stages[2].detail = row.cat_jobstatus === ReviewJobStatus.Queued
      && elapsedMs >= UNCLAIMED_JOB_TIMEOUT_MS
      ? QUEUED_WORKFLOW_DETAIL
      : undefined;
    onProgress?.([...stages]);
  };

  try {
    if (!input.existingJobId) {
      const { assertReviewWorkflowAvailable } = await import('../services/ReviewWorkflowAvailabilityService');
      await assertReviewWorkflowAvailable();
    }
    // Stage 0: Initialize (0%)
    updateProgress(0, 'completed');

    // Stage A: Local Data Extraction (10%)
    // ZIP path: parse components from uploaded solution ZIP
    // Dataverse path: fetch components from live environment
    updateProgress(1, 'active');
    let stageAOutput: LocalStageAOutput;
    let zipRootIconBase64: string | undefined;
    let connectedAgentTargets: ReviewAgentMapTarget[] | undefined;
    if (input.zipFile) {
      if (!input.zipBotSchemaName?.trim()) throw new Error('Select an agent from the ZIP before starting a review.');
      const { parseCSZip } = await import('../declarative-agent/utils/csZipParser');
      const parsed = await parseCSZip(input.zipFile);
      const components = parsed.componentsBySchemaName[input.zipBotSchemaName];
      const zipBot = parsed.bots.find(b => b.schemaName === input.zipBotSchemaName);
      if (!zipBot || !components) {
        throw new Error('The selected agent configuration is not present in this ZIP.');
      }
      if (zipBot.harness === 'unsupported') throw new UnsupportedHarnessError();
      stageAOutput = await stageAService.executeStageAFromData(
        { botId: input.botId, name: input.botName, description: zipBot.description, configuration: zipBot.configuration },
        components
      );
      zipRootIconBase64 = zipBot.iconBase64;
      const targetSchemaNames = new Set(
        (stageAOutput.connectedAgents ?? [])
          .map(agent => agent.targetSchemaName?.trim().toLowerCase())
          .filter((schemaName): schemaName is string => Boolean(schemaName)),
      );
      const retainedTargets = parsed.bots
        .filter(bot => targetSchemaNames.has(bot.schemaName.trim().toLowerCase()))
        .map(bot => ({
          schemaName: bot.schemaName,
          name: bot.name,
          iconBase64: toAgentMapIconDataUrl(bot.iconBase64),
        }));
      connectedAgentTargets = retainedTargets.length > 0 ? retainedTargets : undefined;
    } else {
      if (input.sourceEnvironment === 'zip' || input.zipBotSchemaName) {
        throw new Error('The source ZIP must be supplied before starting a new ZIP review.');
      }
      stageAOutput = await stageAService.executeStageA(input.botId, input.orgUrl);
    }
    onScopeReady?.({
      topicCount: stageAOutput.topicCount,
      toolAndAgentCount:
        stageAOutput.toolCount + (stageAOutput.connectedAgents?.length ?? 0),
      knowledgeSourceCount: stageAOutput.knowledgeCount,
    });
    updateProgress(1, 'completed');

    // Stage B: workflow-backed Pattern Evaluation (30%)
    updateProgress(2, 'active');
    const workflowEvaluation = await evaluateStandardReviewWithWorkflow(stageAOutput, {
      botId: input.botId,
      botName: input.botName,
      sourceEnvironment: input.zipFile ? 'zip' : input.sourceEnvironment ?? input.orgUrl ?? '',
    }, {
      existingJobId: input.existingJobId,
      onJobSubmitted,
      onJobPoll: updateWorkflowPollingProgress,
    });
    updateProgress(2, 'completed');

    // Stage C: the workflow's Instruction Compliance result is already in hand (60%)
    updateProgress(3, 'active');
    updateProgress(3, 'completed');

    // The consistency audit compares this run against the last comparable one. Only its async
    // half runs here; the reconcile itself happens inside the assembly, which is the one place
    // that sits between the deterministic pattern merge and the scoring.
    //
    // No identity means no comparison, so the baseline is not fetched at all: without a
    // `policyHash` the fetch cannot tell a comparable row from an incomparable one, and the
    // assembly would discard whatever it returned anyway.
    const assessmentIdentity = await tryBuildStandardReviewAssessmentIdentity(stageAOutput);
    const consistencyBaseline = assessmentIdentity
      ? await reviewService.getLatestComparableStandardReview(
        {
          botId: input.botId,
          componentIdUnique: input.componentIdUnique,
          sourceEnvironment: input.zipFile ? 'zip' : input.sourceEnvironment ?? '',
        },
        STANDARD_REVIEW_POLICY_VERSION,
        assessmentIdentity.policyHash,
      )
      : undefined;
    // Stage D: Save Results (85%)
    updateProgress(4, 'active');

    const originalStartMs = input.startedAt ? Date.parse(input.startedAt) : NaN;
    const durationMs = Number.isFinite(originalStartMs)
      ? Math.max(0, Date.now() - originalStartMs)
      : Date.now() - startTime;

    // Merge the deterministic Stage A patterns, score, count and summarize. Shared with the
    // architecture review host so both tools report the same numbers for the same agent.
    const reviewResult: ReviewResult = assembleStandardReviewResult(
      stageAOutput,
      workflowEvaluation,
      {
        botId: input.botId,
        componentIdUnique: input.componentIdUnique,
        botName: input.botName,
        iconBase64: input.iconBase64 ?? zipRootIconBase64,
        connectedAgentTargets,
        assessmentIdentity,
        sourceEnvironment: input.zipFile ? 'zip' : input.sourceEnvironment ?? '',
        agentVersion: input.agentVersion,
      },
      durationMs,
      { consistencyBaseline },
    );

    // Save to Dataverse — scores + stage outputs written atomically in one call
    const savedReview = await reviewService.saveReviewResult(reviewResult);

    updateProgress(4, 'completed');

    // Stage E: Complete (100%)
    updateProgress(5, 'completed');

    return {
      reviewResult: savedReview,
      durationMs,
    };
  } catch (error) {
    // Mark current stage as error
    const activeStageIndex = stages.findIndex(s => s.status === 'active');
    if (activeStageIndex >= 0) {
      updateProgress(activeStageIndex, 'error');
    }
    throw error;
  }
}

/**
 * useReviewMutation Hook
 *
 * React Query mutation for executing review pipeline.
 *
 * @param options - Hook options with progress callback
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const reviewMutation = useReviewMutation({
 *   onProgress: (stages) => setProgressStages(stages),
 * });
 *
 * const handleReview = async () => {
 *   await reviewMutation.mutateAsync({
 *     botId: bot.botId,
 *     botName: bot.name,
 *     componentIdUnique: bot.componentIdUnique,
 *   });
 * };
 * ```
 */
export function useReviewMutation(options?: UseReviewMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation<ReviewExecutionResult, Error, ReviewExecutionInput>({
    mutationFn: (input) =>
      executeReviewPipeline(
        input,
        options?.onProgress,
        options?.onJobSubmitted,
        options?.onScopeReady,
      ),
    retry: false,
    onSuccess: (data, input) => {
      // Invalidate reviews for the environment this review was saved against
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews(input.orgUrl) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bots() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviewHistory(
          input.sourceEnvironment,
          getReviewSubjectKey(input),
        ),
      });
      // Invalidate cached review details so re-opening View fetches fresh file
      if (data.reviewResult.reviewId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.review(data.reviewResult.reviewId) });
      }
    },
  });
}
