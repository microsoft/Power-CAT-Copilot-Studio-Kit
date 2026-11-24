import type { PersistedSkillBundleReview } from '../../contracts/ReviewResult';
import {
  AI_MODEL_IDS,
  UNPROVISIONED_AI_MODEL_ID,
} from '../../contracts/Constants';
import type {
  RetrievalIssue,
  SkillBundle,
  SkillBundleReviewResult,
} from '../../agents-experience/contracts/SkillBundle';
import type { ReviewAiPort } from '../../agents-experience/services/CopilotReviewService';
import type { CrossSkillOrchestrationEvaluation } from '../../agents-experience/contracts/SkillEvaluation';
import {
  executeSkillBundleReview,
  type SkillBundleReviewAiPort,
} from '../../agents-experience/services/SkillBundleReviewService';
import { buildOrchestrationPromptInput } from '../../agents-experience/services/skill/SkillPromptPayloadBuilder';
import {
  buildPersistedCrossSkillOrchestration,
  buildPersistedSkillBundleReview,
} from '../../agents-experience/services/skill/persistedSkillReview';
import { redactSecrets } from '../../agents-experience/services/skill/resourceScanners';

export interface DACustomSkillReviewResult {
  reviews: PersistedSkillBundleReview[];
  issues: RetrievalIssue[];
  orchestration?: CrossSkillOrchestrationEvaluation;
}

export interface DACustomSkillModelIds {
  standard: string;
  resource: string;
  fileSynthesis: string;
  bundleSynthesis: string;
  orchestration: string;
}

export interface DACustomSkillReviewDependencies {
  ai?: ReviewAiPort;
  isProvisioned?: (modelId: string) => boolean;
  modelIds?: DACustomSkillModelIds;
  now?: () => string;
}

const DEFAULT_MODEL_IDS: DACustomSkillModelIds = {
  standard: AI_MODEL_IDS.SKILL_BUNDLE_EVAL,
  resource: AI_MODEL_IDS.SKILL_RESOURCE_EVAL,
  fileSynthesis: AI_MODEL_IDS.SKILL_FILE_SYNTHESIS,
  bundleSynthesis: AI_MODEL_IDS.SKILL_DEEP_BUNDLE_SYNTHESIS,
  orchestration: AI_MODEL_IDS.SKILL_CROSS_SKILL_ORCHESTRATION,
};

function failedReview(bundle: SkillBundle, error: unknown): SkillBundleReviewResult {
  return {
    status: 'failed',
    mode: 'standard',
    skillName: bundle.skillName,
    skillSchemaName: bundle.skillSchemaName,
    deterministicFindings: [],
    blocked: false,
    error: redactSecrets(error instanceof Error ? error.message : String(error)),
  };
}

/**
 * Runs the existing skill-review engine for custom skills from a Declarative Agent package.
 */
export async function reviewDACustomSkills(
  bundles: readonly SkillBundle[],
  agentInstructions: string,
  dependencies: DACustomSkillReviewDependencies = {},
  signal?: AbortSignal,
): Promise<DACustomSkillReviewResult> {
  signal?.throwIfAborted();
  if (bundles.length === 0) {
    return { reviews: [], issues: [] };
  }

  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const ai = dependencies.ai ?? (
    await import('../../agents-experience/services/ai-providers/ReviewAiProvider')
  ).createPromptReviewAiPort();
  const isProvisioned = dependencies.isProvisioned
    ?? ((modelId: string) => Boolean(modelId) && modelId !== UNPROVISIONED_AI_MODEL_ID);
  const modelIds = dependencies.modelIds ?? DEFAULT_MODEL_IDS;
  const skillAi: SkillBundleReviewAiPort = {
    invokeStandardSkillBundleEvaluator: ai.invokeStandardSkillBundleEvaluator
      ?? ((payload) =>
        ai.invokeSkillBundleEvaluator({
          skillMarkdown: payload.skill_markdown,
          agentInstructions: payload.agent_instructions,
          siblingDescriptions: payload.sibling_descriptions_json,
          skillResources: payload.resource_excerpts_json,
        }).then((legacy) => ({
          evaluation: {
            status: 'complete' as const,
            dimensions: legacy.dimensions,
            findings: [],
            resourcePurposeAlignment: [],
            operationalAssumptions: [],
            unreviewedResources: [],
            summary: legacy.summary,
            referenceIds: legacy.citations?.map((citation) => citation.id) ?? [],
          },
          issues: [],
        }))),
    invokeSkillResourceChunkEvaluator: ai.invokeSkillResourceChunkEvaluator,
    invokeSkillFileSynthesizer: ai.invokeSkillFileSynthesizer,
    invokeDeepSkillBundleSynthesizer: ai.invokeDeepSkillBundleSynthesizer,
  };
  const deepProvisioned = isProvisioned(modelIds.resource) &&
    isProvisioned(modelIds.fileSynthesis) &&
    isProvisioned(modelIds.bundleSynthesis);

  const preparedBundles = bundles.map((bundle) => ({
    ...bundle,
    agentInstructions,
  }));
  const outcomes = await Promise.allSettled(preparedBundles.map((bundle) =>
    executeSkillBundleReview(bundle, {
      ai: skillAi,
      standardProvisioned: isProvisioned(modelIds.standard),
      deepProvisioned,
    }, undefined, signal)));
  signal?.throwIfAborted();
  const completedAt = now();
  const issues: RetrievalIssue[] = [];
  const reviews = outcomes.map((outcome, index) => {
    const bundle = preparedBundles[index];
    const review = outcome.status === 'fulfilled'
      ? outcome.value
      : failedReview(bundle, outcome.reason);
    if (outcome.status === 'rejected') {
      issues.push({
        code: 'custom-skill-review-failed',
        message: `Review failed for "${bundle.skillName}": ${review.error ?? 'Unknown error'}`,
        resourcePath: 'SKILL.md',
        severity: 'error',
      });
    }
    return buildPersistedSkillBundleReview(
      bundle,
      review,
      startedAt,
      completedAt,
    );
  });

  let orchestration: CrossSkillOrchestrationEvaluation | undefined;
  if (
    preparedBundles.length > 1 &&
    ai.invokeCrossSkillOrchestrator &&
    isProvisioned(modelIds.orchestration)
  ) {
    try {
      signal?.throwIfAborted();
      const knownSkills = preparedBundles.map((bundle) => bundle.skillName);
      const sourceCorpus = preparedBundles
        .map((bundle) => bundle.skillMarkdown)
        .join('\n\n');
      const prompt = buildOrchestrationPromptInput(
        preparedBundles,
        agentInstructions,
      );
      const result = await ai.invokeCrossSkillOrchestrator(
        prompt,
        knownSkills,
        sourceCorpus,
      );
      signal?.throwIfAborted();
      if (!result) {
        // A workflow-backed port yields null when the cross-skill node served no
        // row. D-4 retired the paid prompt fallback, so the stage is reported as
        // failed rather than re-run. DA's own default port cannot produce this.
        throw new Error('the backend returned no orchestration evaluation');
      }
      orchestration = buildPersistedCrossSkillOrchestration(result.evaluation);
    } catch (error) {
      issues.push({
        code: 'custom-skill-orchestration-failed',
        message: `Cross-skill orchestration failed: ${redactSecrets(
          error instanceof Error ? error.message : String(error),
        )}`,
        severity: 'warning',
      });
    }
  }

  return { reviews, issues, orchestration };
}
