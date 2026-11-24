/**
 * PromptAdvisorService
 *
 * Wraps MicrosoftDataverseService for:
 * 1. Fetching AI model ID (simple Dataverse lookup)
 * 2. Invoking Predict analysis (bound action on msdyn_aimodels)
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { PROMPT_ADVISOR_MODEL_NAME } from '../contracts/constants';

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, baseDelayMs: 2000, maxDelayMs: 30000 };

/**
 * Fetch the AI model ID for Prompt Advisor.
 * Throws on failure so React Query captures errors properly.
 */
export async function fetchModelId(): Promise<string> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',
    'msdyn_aimodels',
    undefined,
    undefined,
    undefined,
    undefined,
    'msdyn_aimodelid,msdyn_name',
    `msdyn_name eq '${PROMPT_ADVISOR_MODEL_NAME}'`,
  );

  if (!result.success) {
    throw new Error('Dataverse query failed. Check connector permissions.');
  }

  const data = result.data as unknown as Record<string, unknown>;
  let records: Array<Record<string, unknown>> = [];

  if (Array.isArray(data)) {
    records = data as Array<Record<string, unknown>>;
  } else if (data && Array.isArray(data.value)) {
    records = data.value as Array<Record<string, unknown>>;
  } else if (data && 'msdyn_aimodelid' in data) {
    records = [data];
  }

  if (records.length === 0) {
    throw new Error(`AI model '${PROMPT_ADVISOR_MODEL_NAME}' not found. Deploy the model first.`);
  }

  const modelId = String(records[0].msdyn_aimodelid ?? '');
  if (!modelId) {
    throw new Error('AI model found but ID is empty.');
  }

  return modelId;
}

/**
 * Invoke the Predict bound action to analyze a prompt.
 * Uses `msdyn_aimodels({modelId})/Microsoft.Dynamics.CRM.Predict`.
 */
export async function analyzePrompt(
  modelId: string,
  instruction: string,
  numSamples: string,
): Promise<Record<string, unknown>> {
  const payload = {
    version: '2.0',
    source: JSON.stringify({
      consumptionSource: 'Api',
      partnerSource: 'AIBuilder',
      consumptionSourceVersion: 'GptApiClient',
    }),
    requestv2: {
      '@odata.type': '#Microsoft.Dynamics.CRM.expando',
      Instruction: instruction,
      Number_20of_20Samples: numSamples,
      $customConfig: {
        '@odata.type': '#Microsoft.Dynamics.CRM.expando',
        settings: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          runtime: null,
        },
      },
    },
  };

  return invokePredictWithRetry(modelId, payload);
}

async function invokePredictWithRetry(
  modelId: string,
  payload: Record<string, unknown>,
  config: RetryConfig = DEFAULT_RETRY,
): Promise<Record<string, unknown>> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await MicrosoftDataverseService.PerformBoundActionWithOrganization(
        'current',
        'msdyn_aimodels',
        'Microsoft.Dynamics.CRM.Predict',
        modelId,
        payload,
      );

      if (result.success && result.data) {
        return result.data;
      }

      const errorMsg = (result.error as { message?: string })?.message ?? 'Predict call failed';

      if (errorMsg.includes('QuotaExceeded') || errorMsg.includes('EntitlementNotAvailable')) {
        throw new Error(errorMsg);
      }
      if (attempt === config.maxAttempts) {
        throw new Error(errorMsg);
      }
    } catch (error) {
      lastError = error as Error;
      if (
        lastError.message.includes('QuotaExceeded') ||
        lastError.message.includes('EntitlementNotAvailable') ||
        attempt === config.maxAttempts
      ) {
        throw lastError;
      }
    }

    const delayMs = Math.min(config.baseDelayMs * Math.pow(2, attempt - 1), config.maxDelayMs);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw lastError ?? new Error('Predict retry exhausted');
}
