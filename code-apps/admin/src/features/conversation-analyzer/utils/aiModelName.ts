import type { PromptRow } from '../contracts/types';

export const AI_BUILDER_MODEL_NAMES = {
  pii: 'PII Analysis',
  sentiment: 'Sentiment Analysis',
  custom: 'Custom Prompt Analysis',
} as const;

/** AI Builder model that runs the given prompt. */
export function getAiModelName(prompt: PromptRow): string {
  if (prompt.scope === 'system' && /pii/i.test(prompt.name)) return AI_BUILDER_MODEL_NAMES.pii;
  if (prompt.scope === 'system' && /sentiment/i.test(prompt.name)) return AI_BUILDER_MODEL_NAMES.sentiment;
  return AI_BUILDER_MODEL_NAMES.custom;
}
