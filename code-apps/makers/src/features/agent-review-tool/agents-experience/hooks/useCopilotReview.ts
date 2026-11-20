/**
 * Loads a Microsoft Copilot harness review for a bot: fetches components + configuration,
 * runs the orchestrator (deterministic-first, AI-degradable), and returns the payload.
 *
 * Task 8: Wires canonical skill bundle retrieval into the copilot review pipeline.
 * Supports current/cross-environment bundle assembly via SkillBundleService.
 *
 * NOTE (Task 11): This hook must NOT auto-run. Set `enabled: true` explicitly
 * when the caller intends to execute the review. `retry` is false by default.
 * The React Query AbortSignal is propagated to the orchestrator.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { botService } from '../../services/BotService';
import { aiService } from '../../services/AIService';
import { AI_MODEL_IDS } from '../../contracts/Constants';
import type { AgentsExperienceReviewPayload } from '../../contracts/ReviewResult';
import type { SkillReviewMode, SkillBundle } from '../contracts/SkillBundle';
import type { AgentsExperienceModel, AeSkill } from '../contracts/AgentsExperienceModel';
import { executeCopilotReview } from '../services/CopilotReviewService';
import {
  createProductionSkillBundlePort,
  SkillBundleService,
} from '../services/skill/SkillBundleService';
import { normalizeResource } from '../services/skill/resourceNormalizer';
import { assembleSkillBundle } from '../services/skill/bundleAssembler';
import type { BotComponent } from '../../contracts/ServiceContracts';

export interface CopilotReviewData {
  payload: AgentsExperienceReviewPayload;
  durationMs: number;
}

export const copilotReviewQueryKey = (botId: string, mode: SkillReviewMode, orgUrl?: string | null) =>
  ['copilot-review', botId, mode, orgUrl ?? null] as const;

/** Default skill review mode. */
const DEFAULT_SKILL_REVIEW_MODE: SkillReviewMode = 'standard';

/** Options for useCopilotReview. `enabled` must be true for the query to execute. */
export interface UseCopilotReviewOptions {
  botId: string;
  mode?: SkillReviewMode;
  orgUrl?: string | null;
  /** Must be true for the query to execute. Defaults to false — never auto-runs. */
  enabled?: boolean;
}

/**
 * Production getSkillBundles implementation.
 *
 * For each model skill that can be assembled (has a componentId), this function:
 * 1. Lists published type-14 children from Dataverse (current or cross-environment)
 * 2. Downloads resource files with concurrency 2
 * 3. Normalizes fulfilled files (path, SHA, decode)
 * 4. Assembles one SkillBundle per model skill via assembleSkillBundle
 *
 * Retrieval/download issues are preserved as explicit issues on the bundle,
 * not swallowed.
 */
async function getSkillBundlesProduction(
  botId: string,
  model: AgentsExperienceModel,
  orgUrl?: string | null,
  signal?: AbortSignal,
): Promise<SkillBundle[]> {
  const port = createProductionSkillBundlePort();
  const service = new SkillBundleService(port);

  const bundles: SkillBundle[] = [];

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

    const listResult = await service.listPublishedChildren(
      skill.componentId,
      botId,
      orgUrl,
    );

    const downloadResults = await service.downloadPublishedResources(
      listResult.rows,
      orgUrl,
      signal,
    );

    const resources = [];
    const retrievalIssues = [...listResult.issues];

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

    const context = {
      agentInstructions: model.agentSettings.instructions,
      siblingDescriptions: model.skills
        .filter((s: AeSkill) => s.schemaname !== skill.schemaname)
        .map((s: AeSkill) => ({ name: s.frontmatterName ?? s.name, description: s.frontmatterDescription })),
    };

    const assembled = await assembleSkillBundle(parentComponent, resources, context);
    assembled.retrievalIssues.push(...retrievalIssues);
    bundles.push(assembled);
  }

  return bundles;
}

async function loadCopilotReview(
  botId: string,
  mode: SkillReviewMode,
  orgUrl?: string | null,
  signal?: AbortSignal,
): Promise<CopilotReviewData> {
  const { configuration, template } = await botService.getBotHarnessSource(botId, orgUrl);
  const authenticationMode = await botService.getBotAuthenticationMode(botId, orgUrl);
  const start = performance.now();
  const payload = await executeCopilotReview(
    botId,
    configuration,
    {
      getBotComponents: (id) => botService.getBotComponents(id, orgUrl),
      authenticationMode,
      template,
      ai: {
        invokeSkillBundleEvaluator: (input) => aiService.invokeSkillBundleEvaluator(input),
        invokeInstructionCoverage: (instructions, names) => aiService.invokeInstructionCoverage(instructions, names),
        invokeStandardSkillBundleEvaluator: (promptPayload, sourceCorpus) =>
          aiService.invokeStandardSkillBundleEvaluator(promptPayload, sourceCorpus),
        invokeSkillResourceChunkEvaluator: (rPayload, chunk) =>
          aiService.invokeSkillResourceChunkEvaluator(rPayload, chunk),
        invokeSkillFileSynthesizer: (fPayload, knownPaths, sourceCorpus) =>
          aiService.invokeSkillFileSynthesizer(fPayload, knownPaths, sourceCorpus),
        invokeDeepSkillBundleSynthesizer: (bPayload, knownPaths, sourceCorpus) =>
          aiService.invokeDeepSkillBundleSynthesizer(bPayload, knownPaths, sourceCorpus),
      },
      skillEvalModelId: AI_MODEL_IDS.SKILL_BUNDLE_EVAL,
      coverageModelId: AI_MODEL_IDS.INSTRUCTION_COVERAGE,
      skillResourceEvalModelId: AI_MODEL_IDS.SKILL_RESOURCE_EVAL,
      fileSynthesisModelId: AI_MODEL_IDS.SKILL_FILE_SYNTHESIS,
      deepBundleSynthesisModelId: AI_MODEL_IDS.SKILL_DEEP_BUNDLE_SYNTHESIS,
      getSkillBundles: (id, model, url, reviewSignal) =>
        getSkillBundlesProduction(id, model, url ?? orgUrl, reviewSignal),
    },
    undefined,
    signal,
  );
  return { payload, durationMs: performance.now() - start };
}

/**
 * React Query hook for loading a Microsoft Copilot harness review.
 *
 * IMPORTANT: Set `enabled: true` explicitly to execute. Defaults to false.
 * Uses `retry: false` to avoid automatic re-invocation of AI.
 * Propagates React Query's AbortSignal for cancellation.
 */
export function useCopilotReview(
  options: UseCopilotReviewOptions,
): UseQueryResult<CopilotReviewData, Error> {
  const { botId, mode = DEFAULT_SKILL_REVIEW_MODE, orgUrl, enabled = false } = options;

  return useQuery({
    queryKey: copilotReviewQueryKey(botId, mode, orgUrl),
    queryFn: ({ signal }) => loadCopilotReview(botId, mode, orgUrl, signal),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    enabled,
  });
}
