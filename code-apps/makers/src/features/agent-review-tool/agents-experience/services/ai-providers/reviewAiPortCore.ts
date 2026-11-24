import type { ReviewAiPort } from '../CopilotReviewService';
import type { WorkflowReviewAiProviderCore } from './WorkflowReviewAiProviderCore';

export const WORKFLOW_SERVED_MODEL_ID = 'workflow-served';

/** Bind all existing AI stages without importing a generated transport or losing workflow overrides. */
export function bindPromptReviewAiPort(service: Required<Omit<ReviewAiPort, 'aiBackend'>>): Required<ReviewAiPort> {
  return {
    aiBackend: 'prompt',
    invokeSkillBundleEvaluator: service.invokeSkillBundleEvaluator.bind(service),
    invokeInstructionCoverage: service.invokeInstructionCoverage.bind(service),
    invokeStandardSkillBundleEvaluator: service.invokeStandardSkillBundleEvaluator.bind(service),
    invokeSkillResourceChunkEvaluator: service.invokeSkillResourceChunkEvaluator.bind(service),
    invokeSkillFileSynthesizer: service.invokeSkillFileSynthesizer.bind(service),
    invokeDeepSkillBundleSynthesizer: service.invokeDeepSkillBundleSynthesizer.bind(service),
    invokeCrossSkillOrchestrator: service.invokeCrossSkillOrchestrator.bind(service),
  };
}

/**
 * Serve workflow stages without falling back to retired deep prompts.
 */
export function bindWorkflowReviewAiPort(
  provider: WorkflowReviewAiProviderCore, prompt: Required<Omit<ReviewAiPort, 'aiBackend'>>,
): Required<ReviewAiPort> {
  return {
    ...prompt,
    aiBackend: 'workflow',
    invokeSkillResourceChunkEvaluator: rejectWorkflowDeepPrompt,
    invokeSkillFileSynthesizer: rejectWorkflowDeepPrompt,
    invokeDeepSkillBundleSynthesizer: rejectWorkflowDeepPrompt,
    invokeStandardSkillBundleEvaluator: provider.invokeStandardSkillBundleEvaluator,
    invokeCrossSkillOrchestrator: (_payload, skills, corpus) =>
      provider.invokeCrossSkillOrchestrator(skills, corpus),
    invokeInstructionCoverage: (instructions) =>
      provider.invokeInstructionCoverage(instructions),
  };
}

async function rejectWorkflowDeepPrompt(): Promise<never> {
  throw new Error('Separate deep prompts are not available in workflow mode.');
}
