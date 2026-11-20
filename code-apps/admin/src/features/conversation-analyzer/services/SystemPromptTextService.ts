/**
 * SystemPromptTextService - reads the instructions of a system prompt (PII / Sentiment)
 * from its published AI Builder run configuration.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { PromptRow } from '../contracts/types';
import { getAiModelName } from '../utils/aiModelName';

const RUN_CONFIGURATION_TYPE = 190690001;
const PUBLISHED_STATE = 2;

interface PromptPart {
  type?: string;
  text?: string;
  id?: string;
}

function toRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const value = (data as { value?: unknown } | undefined)?.value;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Joins GptDynamicPrompt parts; input variables are shown as {Name} placeholders. */
function renderPrompt(customConfiguration: string): string | undefined {
  let parsed: { prompt?: PromptPart[] };
  try {
    parsed = JSON.parse(customConfiguration) as { prompt?: PromptPart[] };
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed.prompt)) return undefined;
  const text = parsed.prompt
    .map((part) => (part.type === 'literal' ? part.text ?? '' : part.id ? `{${part.id}}` : ''))
    .join('')
    .trim();
  return text || undefined;
}

export class SystemPromptTextService {
  /** Returns the published prompt instructions, or undefined when they can't be read. */
  static async getPromptText(prompt: PromptRow): Promise<string | undefined> {
    const modelName = getAiModelName(prompt);
    const modelResult = await MicrosoftDataverseService.ListRecordsWithOrganization(
      'current',
      'msdyn_aimodels',
      undefined,
      undefined,
      undefined,
      undefined,
      'msdyn_aimodelid',
      `msdyn_name eq '${modelName}'`,
    );
    if (!modelResult.success) {
      throw new Error(modelResult.error?.message ?? 'Unable to load the system prompt.');
    }
    const modelId = toRecords(modelResult.data)[0]?.msdyn_aimodelid;
    if (typeof modelId !== 'string' || !modelId) return undefined;

    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      'current',
      'msdyn_aiconfigurations',
      undefined,
      undefined,
      undefined,
      undefined,
      'msdyn_customconfiguration',
      `_msdyn_aimodelid_value eq ${modelId} and msdyn_type eq ${RUN_CONFIGURATION_TYPE} and statecode eq ${PUBLISHED_STATE}`,
      'modifiedon desc',
      undefined,
      undefined,
      1,
    );
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to load the system prompt.');
    }
    const config = toRecords(result.data)[0]?.msdyn_customconfiguration;
    return typeof config === 'string' ? renderPrompt(config) : undefined;
  }
}
