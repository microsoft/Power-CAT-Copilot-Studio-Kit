/**
 * Microsoft Copilot harness review mutation hook (Task 10).
 *
 * Executes once, persists once, invalidates review queries.
 * Emits SkillReviewProgress. Passes cancellation. Never reruns
 * after persistence failure. Saves partial/cancelled deterministic
 * results when meaningful.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { botService } from '../../services/BotService';
import { reviewService } from '../../services/ReviewService';
import { queryKeys } from '../../hooks/queryKeys';
import { AI_MODEL_IDS } from '../../contracts/Constants';
import type { ReviewResult } from '../../contracts/ReviewResult';
import { getReviewSubjectKey } from '../../utils/reviewHistory';
import type {
  SkillBundle,
  SkillReviewProgress,
  SkillResourceRow,
  RetrievalIssue,
} from '../contracts/SkillBundle';
import type { AgentsExperienceModel, AeSkill } from '../contracts/AgentsExperienceModel';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { executeCopilotReview, type ReviewDeps } from '../services/CopilotReviewService';
import { computeDeterministicFindingsByBundle } from '../services/SkillBundleReviewService';
import {
  createProductionSkillBundlePort,
  SkillBundleService,
} from '../services/skill/SkillBundleService';
import { normalizeResource } from '../services/skill/resourceNormalizer';
import { assembleSkillBundle } from '../services/skill/bundleAssembler';
import { buildPersistedCopilotReview, type CopilotReviewPersistenceInput } from '../services/skill/persistedSkillReview';
import {
  createPromptReviewAiPort,
  createWorkflowReviewAiPort,
  logReviewBackend,
  resolveReviewAiProvider,
  WORKFLOW_SERVED_MODEL_ID,
} from '../services/ai-providers/ReviewAiProvider';
import { toSkillReviewProgress } from '../services/jobs/reviewJobProgress';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { detectAgentHarness, UnsupportedHarnessError } from '../services/detection';

/**
 * Scale bundle progress into the review's evaluation band without dropping
 * granular fields such as resourcePath or unit counts.
 */
export function scaleSkillProgress(
  progress: SkillReviewProgress,
  currentMaxPercent: number,
): SkillReviewProgress {
  const scaled = 15 + Math.round((progress.percent / 100) * 70);
  return {
    ...progress,
    percent: Math.max(currentMaxPercent, scaled),
  };
}

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/** Input for the copilot review mutation. */
export interface CopilotReviewExecutionInput {
  botId: string;
  botName: string;
  componentIdUnique: string;
  orgUrl?: string | null;
  sourceEnvironment?: string;
  /** Live bot publication captured before review execution. */
  agentVersion?: string;
  /** Durable workflow job to collect instead of submitting duplicate AI work. */
  existingJobId?: string;
  /** Original start time retained across an app restart. */
  startedAt?: string;
  /** Parsed in-memory solution data. Present only for ZIP-sourced reviews. */
  zipData?: CopilotReviewZipData;
}

/** Microsoft Copilot agent data parsed from a Copilot Studio solution ZIP. */
export interface CopilotReviewZipData {
  configuration: string;
  components: BotComponent[];
  resources: Array<{ row: SkillResourceRow; bytes: Uint8Array }>;
  /** Agent authentication mode from bot.xml; undefined when not captured. */
  authenticationMode?: number;
  /** Agent template from bot.xml; undefined when not captured. */
  template?: string;
}

// ---------------------------------------------------------------------------
// Bundle retrieval (captures bundles for persistence)
// ---------------------------------------------------------------------------

async function getSkillBundlesWithCapture(
  botId: string,
  model: AgentsExperienceModel,
  captured: SkillBundle[],
  orgUrl?: string | null,
  signal?: AbortSignal,
  zipResources?: CopilotReviewZipData['resources'],
): Promise<SkillBundle[]> {
  const service = zipResources
    ? null
    : new SkillBundleService(createProductionSkillBundlePort());
  const bundles: SkillBundle[] = [];
  const zipBundleSkills = model.skills.filter((skill) => skill.source === 'zip-bundle');

  for (const skill of model.skills) {
    if (!skill.componentId) continue;
    if (signal?.aborted) break;

    const syntheticData = JSON.stringify({ content: skill.markdown });
    const parentComponent: BotComponent = {
      botcomponentid: skill.componentId,
      botid: botId,
      componenttype: '9',
      content: syntheticData,
      data: syntheticData,
      name: skill.name,
      componentidunique: skill.componentIdUnique,
      schemaname: skill.schemaname,
    };

    const resources = [];
    const retrievalIssues: RetrievalIssue[] = [];

    if (zipResources) {
      const sameIdentifier = (left: string, right: string) =>
        left.replace(/[{}]/g, '').toLowerCase() === right.replace(/[{}]/g, '').toLowerCase();
      let selectedResources = zipResources.filter(({ row }) =>
        sameIdentifier(row.parentbotcomponentid, skill.componentId)
        || sameIdentifier(row.parentbotcomponentid, skill.componentIdUnique),
      );

      // Some solution layers omit the parent lookup in botcomponent.xml. A
      // single packaged skill is still unambiguous and owns all embedded files.
      if (
        selectedResources.length === 0
        && skill.source === 'zip-bundle'
        && zipBundleSkills.length === 1
      ) {
        selectedResources = zipResources;
      }

      for (const resource of selectedResources) {
        if (signal?.aborted) {
          retrievalIssues.push({
            code: 'download-cancelled',
            message: `Resource loading cancelled for "${resource.row.name}"`,
            resourcePath: resource.row.name,
            severity: 'warning',
          });
          continue;
        }
        try {
          resources.push(await normalizeResource(resource.row, resource.bytes));
        } catch (error) {
          retrievalIssues.push({
            code: 'resource-normalization-failed',
            message: `Could not read "${resource.row.name}": ${error instanceof Error ? error.message : String(error)}`,
            resourcePath: resource.row.name,
            severity: 'error',
          });
        }
      }
    } else if (service) {
      const listResult = await service.listPublishedChildren(skill.componentId, botId, orgUrl);
      retrievalIssues.push(...listResult.issues);
      const downloadResults = await service.downloadPublishedResources(listResult.rows, orgUrl, signal);

      for (let i = 0; i < downloadResults.length; i++) {
        const dlResult = downloadResults[i];
        const row = listResult.rows[i];
        if (dlResult.status === 'fulfilled') {
          const normalized = await normalizeResource(row, dlResult.value);
          resources.push(normalized);
        } else if (dlResult.status === 'rejected') {
          retrievalIssues.push({
            code: 'download-failed',
            message: `Download failed for "${row.name}": ${dlResult.reason instanceof Error ? dlResult.reason.message : String(dlResult.reason)}`,
            resourcePath: row.name,
            severity: 'error',
          });
        } else {
          retrievalIssues.push({
            code: 'download-cancelled',
            message: `Download cancelled for "${row.name}"`,
            resourcePath: row.name,
            severity: 'warning',
          });
        }
      }
    }

    const context = {
      agentInstructions: model.agentSettings.instructions,
      siblingDescriptions: model.skills
        .filter((s: AeSkill) => s.schemaname !== skill.schemaname)
        .map((s: AeSkill) => ({ name: s.frontmatterName ?? s.name, description: s.frontmatterDescription })),
    };

    const assembled = await assembleSkillBundle(parentComponent, resources, context);
    assembled.retrievalIssues.push(...retrievalIssues);
    bundles.push(assembled);
    // Capture incrementally so partial results survive if a later iteration throws.
    captured.push(assembled);
  }

  return bundles;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Execute the copilot review pipeline and persist atomically.
 *
 * 1. Fetch bot configuration
 * 2. Run review orchestrator (deterministic + AI)
 * 3. Project results into persisted contracts
 * 4. Save to Dataverse (single write)
 *
 * Exported so Task 11 can invoke directly with its own AbortSignal.
 */
export async function executeAndSaveCopilotReview(
  input: CopilotReviewExecutionInput,
  onProgress?: (p: SkillReviewProgress) => void,
  signal?: AbortSignal,
  onJobSubmitted?: (jobId: string) => void,
): Promise<ReviewResult> {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const startMs = performance.now();
  if (signal?.aborted) throw new Error('Review cancelled');
  if (!input.existingJobId && resolveReviewAiProvider() === 'workflow') {
    const { assertReviewWorkflowAvailable } = await import('../../services/ReviewWorkflowAvailabilityService');
    await assertReviewWorkflowAvailable(signal);
  }

  // Monotonic progress: max-so-far across top-level phases and per-bundle events
  let maxPercent = 0;
  /** Emit top-level phase progress with monotonic percent. */
  function emitTopLevel(
    stage: SkillReviewProgress['stage'],
    message: string,
    targetPercent: number,
  ): void {
    if (!onProgress) return;
    maxPercent = Math.max(maxPercent, targetPercent);
    onProgress({
      stage,
      percent: maxPercent,
      message,
      completedUnits: 0,
      totalUnits: 0,
      partialFailures: 0,
    });
  }

  /**
   * Forward per-bundle SkillReviewProgress events, scaling percent into
   * the bundle evaluation band (15–85%) while preserving stage, skillName,
   * resourcePath, units, and partialFailures. Never allows backward movement.
   */
  function forwardSkillProgress(p: SkillReviewProgress): void {
    if (!onProgress) return;
    const scaled = scaleSkillProgress(p, maxPercent);
    maxPercent = scaled.percent;
    onProgress(scaled);
  }

  // 1. Fetch bot configuration
  emitTopLevel('loading', 'Loading bot configuration', 5);
  const source = input.zipData
    ? { configuration: input.zipData.configuration, template: input.zipData.template }
    : await botService.getBotHarnessSource(input.botId, input.orgUrl);
  const { configuration } = source;
  // Issue 947: no checks for an unsupported harness (rules 1a, 1b, and 2).
  if (detectAgentHarness(configuration, source.template).kind === 'unsupported') {
    throw new UnsupportedHarnessError();
  }
  const authenticationMode = input.zipData
    ? input.zipData.authenticationMode
    : await botService.getBotAuthenticationMode(input.botId, input.orgUrl);

  if (signal?.aborted) {
    throw new Error('Review cancelled');
  }

  // This is the Copilot harness provider. Standard and M365 package reviews
  // also use durable jobs, but select their transport in their own pipelines.
  // The prompt override and the existing optional-stage fallbacks are unchanged.
  const backend = input.existingJobId ? 'workflow' : resolveReviewAiProvider();
  logReviewBackend(backend);

  const workflow = backend === 'workflow'
    ? createWorkflowReviewAiPort({
        botId: input.botId,
        botName: input.botName,
        sourceEnvironment: input.sourceEnvironment ?? input.orgUrl ?? '',
        existingJobId: input.existingJobId,
        onJobSubmitted,
        // toSkillReviewProgress already returns absolute percents, so this must
        // not go through forwardSkillProgress — that would scale them twice.
        onProgress: (p) => {
          if (!onProgress) return;
          const mapped = toSkillReviewProgress(p, maxPercent);
          maxPercent = mapped.percent;
          onProgress(mapped);
        },
        signal,
      })
    : null;

  // 2. Execute copilot review — capture bundles via wrapper
  const capturedBundles: SkillBundle[] = [];

  emitTopLevel('downloading', 'Assembling skill bundles', 15);

  // The port is the single place backend selection happens. Building this object
  // by hand instead would silently strip every workflow override -- the reason
  // `invokeCrossSkillOrchestrator` kept running on AI Builder after it had been
  // migrated.
  const ai: ReviewDeps['ai'] = workflow ? workflow.port : createPromptReviewAiPort();

  const deps: ReviewDeps = {
    getBotComponents: async (id) => input.zipData?.components
      ?? await botService.getBotComponents(id, input.orgUrl),
    authenticationMode,
    template: source.template,
    ai,
    skillEvalModelId: AI_MODEL_IDS.SKILL_BUNDLE_EVAL,
    // The workflow serves instruction coverage from its own node, so the AI
    // Builder model id no longer gates the stage. On the prompt backend the zero
    // GUID still means "not provisioned" and the stage stays unavailable.
    coverageModelId: workflow
      ? WORKFLOW_SERVED_MODEL_ID
      : AI_MODEL_IDS.INSTRUCTION_COVERAGE,
    skillResourceEvalModelId: AI_MODEL_IDS.SKILL_RESOURCE_EVAL,
    fileSynthesisModelId: AI_MODEL_IDS.SKILL_FILE_SYNTHESIS,
    deepBundleSynthesisModelId: AI_MODEL_IDS.SKILL_DEEP_BUNDLE_SYNTHESIS,
    crossSkillOrchestrationModelId: workflow
      ? WORKFLOW_SERVED_MODEL_ID
      : AI_MODEL_IDS.SKILL_CROSS_SKILL_ORCHESTRATION,
    getSkillBundles: async (id, model, _url, sig) => {
      const bundles = await getSkillBundlesWithCapture(
        id,
        model,
        capturedBundles,
        input.orgUrl,
        sig,
        input.zipData?.resources,
      );
      // Submit the whole corpus as one job before the orchestrator reaches its
      // AI stage, so the Dataverse trigger latency is paid once per review
      // rather than once per skill. A final setup rejection stops the review;
      // other submission failures retain partial deterministic results.
      if (workflow) {
        // Real scanner output, not an empty map: the reviewing agent is asked to
        // build on the deterministic layer, and previously received nothing.
        await workflow.provider.prime(
          bundles,
          computeDeterministicFindingsByBundle(bundles),
          model,
        );
      }
      return bundles;
    },
    onSkillProgress: forwardSkillProgress,
  };

  const payload = await executeCopilotReview(input.botId, configuration, deps, (stage) => {
    if (stage.includes('Classifying')) {
      emitTopLevel('standard-ai', stage, 85);
    } else if (stage.includes('Evaluating')) {
      emitTopLevel('standard-ai', stage, 15);
    } else if (stage.includes('Assembling')) {
      emitTopLevel('downloading', stage, 15);
    } else if (stage.includes('Running') || stage.includes('Computing')) {
      emitTopLevel('deterministic-scan', stage, 10);
    } else {
      emitTopLevel('loading', stage, 5);
    }
  }, signal);

  const completedAt = new Date().toISOString();
  const originalStartMs = Date.parse(startedAt);
  const durationMs = input.startedAt && Number.isFinite(originalStartMs)
    ? Math.max(0, Date.now() - originalStartMs)
    : Math.round(performance.now() - startMs);

  // 3. Project into persisted contracts
  emitTopLevel('persisting', 'Persisting review results', 90);

  const persistenceInput: CopilotReviewPersistenceInput = {
    payload,
    bundles: capturedBundles,
    mode: payload.skillReviewMode ?? 'standard',
    startedAt,
    completedAt,
  };

  const persisted = buildPersistedCopilotReview(persistenceInput);
  const storedScore = payload.score.grounded ?? 0;
  const completion = getCopilotReviewCompletion(persisted.payload);

  // 4. Build ReviewResult and save atomically
  const review: ReviewResult = {
    botId: input.botId,
    componentIdUnique: input.componentIdUnique,
    botName: input.botName,
    sourceEnvironment: input.sourceEnvironment ?? '',
    agentVersion: input.agentVersion,
    reviewKind: 'copilot',
    overallScore: storedScore,
    overallScoreApplicable: payload.score.grounded !== null,
    patternScore: storedScore,
    instructionScore: storedScore,
    highSeverityCount: payload.score.errors,
    mediumSeverityCount: payload.score.warnings,
    lowSeverityCount: 0,
    totalIssueCount: payload.score.errors + payload.score.warnings,
    reviewedOn: new Date(),
    durationMs,
    ...completion,
    agentsExperience: persisted.payload,
  };

  const savedReview = await reviewService.saveReviewResult(review);

  emitTopLevel('complete', completion.errorMessage ?? 'Review complete', 100);

  return savedReview;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCopilotReviewMutationOptions {
  onProgress?: (p: SkillReviewProgress) => void;
  /** Returns an AbortSignal so the caller (Task 11) can cancel an in-flight review. */
  getAbortSignal?: () => AbortSignal | undefined;
  /** Reports the durable workflow job id for app restart recovery. */
  onJobSubmitted?: (jobId: string) => void;
}

/**
 * Invalidates every cached surface backed by a newly saved Copilot review.
 */
export function invalidateCopilotReviewQueries(
  queryClient: QueryClient,
  data: ReviewResult,
  input: CopilotReviewExecutionInput,
): void {
  void queryClient.invalidateQueries({
    queryKey: input.zipData
      ? [...queryKeys.all, 'reviews']
      : queryKeys.reviews(input.orgUrl),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.bots() });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.reviewHistory(
      input.sourceEnvironment,
      getReviewSubjectKey(input),
    ),
  });
  if (data.reviewId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.review(data.reviewId) });
  }
}

/**
 * React Query mutation for the Microsoft Copilot harness review pipeline.
 *
 * Executes once, persists once, invalidates queries, emits progress.
 * Never reruns after persistence failure.
 */
export function useCopilotReviewMutation(options?: UseCopilotReviewMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation<ReviewResult, Error, CopilotReviewExecutionInput>({
    mutationFn: (input) =>
      executeAndSaveCopilotReview(
        input,
        options?.onProgress,
        options?.getAbortSignal?.(),
        options?.onJobSubmitted,
      ),
    retry: false,
    onSuccess: (data, input) => {
      invalidateCopilotReviewQueries(queryClient, data, input);
    },
  });
}
