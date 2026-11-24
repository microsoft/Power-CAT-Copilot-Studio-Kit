/**
 * Selects the AI backend for the Microsoft Copilot harness review (spec 014).
 *
 * Two backends satisfy the same `ReviewAiPort` contract:
 *
 * - `prompt`   — AI Builder prompts via Dataverse PredictV2. The production
 *                rollback target.
 * - `workflow` — a Copilot Studio workflow whose agent node evaluates each
 *                component and writes results back to Dataverse.
 *
 * Both feed the same validators, citation gate and scoring, so switching
 * backends changes the transport and not the trust model. Flipping the flag
 * back to `prompt` is the kill switch and needs no redeploy.
 */
import { aiService } from '../../../services/AIService';
import type { ReviewAiPort } from '../CopilotReviewService';
import { bindWorkflowReviewAiPort } from './reviewAiPortCore';
import {
  WorkflowReviewAiProvider,
  type WorkflowProviderOptions,
} from './WorkflowReviewAiProvider';

/*
 * Backend selection moved to reviewAiBackend.ts.
 *
 * The progress adapters need to know which backend is running so a stage can be
 * labelled with what actually serves it. Importing this module for that pulled
 * aiService -- and with it the generated Dataverse client -- into a pure mapping
 * function, which broke its tests and coupled two unrelated concerns. The read
 * is a localStorage lookup with no dependencies, so it now lives on its own and
 * is re-exported here for callers that want the factories too.
 */
export {
  resolveReviewAiProvider,
  logReviewBackend,
  type ReviewAiProviderKind,
} from './reviewAiBackend';

/**
 * Stand-in model id for a stage the workflow serves.
 *
 * `CopilotReviewService` gates each AI stage on `isProvisioned(modelId)`
 * -- a guard written when every stage ran on AI Builder. A workflow-served stage
 * has no AI Builder model, and `AI_MODEL_IDS.INSTRUCTION_COVERAGE` is the
 * all-zero "unprovisioned" sentinel, so passing it through would keep the stage
 * switched off and show the "classifier is not configured" banner while the
 * workflow was in fact running it.
 *
 * This value is never used to invoke anything. It exists only to say
 * "provisioned, just not by AI Builder".
 */
export const WORKFLOW_SERVED_MODEL_ID = 'workflow-served';

/** The AI Builder backend. Every method delegates to the existing service. */
export function createPromptReviewAiPort(): Required<ReviewAiPort> {
  return {
    aiBackend: 'prompt',
    invokeSkillBundleEvaluator: (input) => aiService.invokeSkillBundleEvaluator(input),
    invokeInstructionCoverage: (instructions, names) =>
      aiService.invokeInstructionCoverage(instructions, names),
    invokeStandardSkillBundleEvaluator: (payload, sourceCorpus) =>
      aiService.invokeStandardSkillBundleEvaluator(payload, sourceCorpus),
    invokeSkillResourceChunkEvaluator: (payload, chunk) =>
      aiService.invokeSkillResourceChunkEvaluator(payload, chunk),
    invokeSkillFileSynthesizer: (payload, knownPaths, sourceCorpus) =>
      aiService.invokeSkillFileSynthesizer(payload, knownPaths, sourceCorpus),
    invokeDeepSkillBundleSynthesizer: (payload, knownPaths, sourceCorpus) =>
      aiService.invokeDeepSkillBundleSynthesizer(payload, knownPaths, sourceCorpus),
    invokeCrossSkillOrchestrator: (payload, knownSkills, sourceCorpus) =>
      aiService.invokeCrossSkillOrchestrator(payload, knownSkills, sourceCorpus),
  };
}

/**
 * The workflow backend.
 *
 * Serves the skill, resource, orchestration and instruction checks from the
 * workflow alone. Missing per-file analysis reduces coverage without invoking
 * retired deep prompts. The returned provider must be primed
 * with the assembled bundles before the orchestrator reaches its AI stage.
 *
 * @param options - Review identity, progress callback and cancellation signal.
 */
export function createWorkflowReviewAiPort(options: WorkflowProviderOptions): {
  port: ReviewAiPort;
  provider: WorkflowReviewAiProvider;
} {
  const provider = new WorkflowReviewAiProvider(options);
  const promptPort = createPromptReviewAiPort();

  return {
    provider,
    port: bindWorkflowReviewAiPort(provider, promptPort),
  };
}
