import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { PromptRow } from '../contracts/types';

export const AI_BUILDER_MODEL_NAMES = {
  pii: 'PII Analysis',
  sentiment: 'Sentiment Analysis',
  custom: 'Custom Prompt Analysis',
} as const;

interface PredictionOutput {
  text?: string;
  structuredOutput?: Record<string, unknown>;
}

const modelIds = new Map<string, Promise<string>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.summary) && typeof value.summary.convSummary === 'string') {
    return value.summary.convSummary;
  }
  return typeof value.convSummary === 'string' ? value.convSummary : undefined;
}

/** Shared AI Builder prediction logic for both single-agent and multi-agent analysis. */
export class ConversationPredictionService {
  /** Executes the selected prompt in the app environment, not the transcript's source environment. */
  static async predict(
    prompt: PromptRow,
    conversationText: string,
  ): Promise<{ resultText: string; summary: string }> {
    const modelName =
      prompt.scope === 'system' && /pii/i.test(prompt.name)
        ? AI_BUILDER_MODEL_NAMES.pii
        : prompt.scope === 'system' && /sentiment/i.test(prompt.name)
          ? AI_BUILDER_MODEL_NAMES.sentiment
          : AI_BUILDER_MODEL_NAMES.custom;
    let modelId = modelIds.get(modelName);
    if (!modelId) {
      modelId = ConversationPredictionService.fetchModelId(modelName);
      modelIds.set(modelName, modelId);
      void modelId.catch(() => modelIds.delete(modelName));
    }

    const output = await ConversationPredictionService.invokePredict(
      await modelId,
      ConversationPredictionService.buildPayload(prompt, conversationText),
    );
    const resultText = output.text?.trim() || (
      output.structuredOutput && Object.keys(output.structuredOutput).length > 0
        ? JSON.stringify(output.structuredOutput)
        : ''
    );
    if (!resultText) throw new Error('AI Builder returned no analysis result.');

    let summary = getSummary(output.structuredOutput);
    if (!summary) {
      try {
        summary = getSummary(JSON.parse(resultText));
      } catch {
        // Custom prompts may return plain text rather than JSON.
        summary = undefined;
      }
    }
    return { resultText, summary: summary ?? 'Analysis complete.' };
  }

  private static buildPayload(prompt: PromptRow, conversationText: string): Record<string, unknown> {
    const requestv2: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.expando',
      AgentConversation: conversationText,
    };
    if (prompt.scope === 'custom' && prompt.userPrompt) requestv2.UserPrompt = prompt.userPrompt;
    requestv2.$customConfig = {
      '@odata.type': '#Microsoft.Dynamics.CRM.expando',
      settings: {
        '@odata.type': '#Microsoft.Dynamics.CRM.expando',
        runtime: null,
      },
    };
    return {
      version: '2.0',
      source: JSON.stringify({
        consumptionSource: 'Api',
        partnerSource: 'AIBuilder',
        consumptionSourceVersion: 'GptApiClient',
      }),
      requestv2,
    };
  }

  private static async invokePredict(
    modelId: string,
    payload: Record<string, unknown>,
  ): Promise<PredictionOutput> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await ConversationPredictionService.withTimeout(
          MicrosoftDataverseService.PerformBoundActionWithOrganization(
            'current',
            'msdyn_aimodels',
            'Microsoft.Dynamics.CRM.Predict',
            modelId,
            payload,
          ),
        );
        if (!result.success) throw new Error(result.error?.message ?? 'AI Builder prediction failed.');
        const response = result.data?.responsev2;
        const output = isRecord(response) ? response.predictionOutput : undefined;
        if (!isRecord(output)) throw new Error('AI Builder returned an invalid prediction response.');
        return {
          text: typeof output.text === 'string' ? output.text : undefined,
          structuredOutput: isRecord(output.structuredOutput) ? output.structuredOutput : undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('AI Builder prediction failed.', { cause: error });
        if (/QuotaExceeded|EntitlementNotAvailable/.test(lastError.message)) throw lastError;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** (attempt - 1)));
      }
    }
    throw lastError ?? new Error('AI Builder prediction failed after retries.');
  }

  private static async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('AI Builder prediction timed out.')), 60_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private static async fetchModelId(modelName: string): Promise<string> {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      'current',
      'msdyn_aimodels',
      undefined,
      undefined,
      undefined,
      undefined,
      'msdyn_aimodelid,msdyn_name',
      `msdyn_name eq '${modelName}'`,
    );
    if (!result.success) {
      throw new Error(result.error?.message ?? `Unable to load AI model '${modelName}'.`);
    }
    const data = result.data;
    const records: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.value) ? data.value : data ? [data] : [];
    const record = records.find(
      (row) => isRecord(row) && typeof row.msdyn_aimodelid === 'string',
    );
    if (!isRecord(record) || typeof record.msdyn_aimodelid !== 'string' || !record.msdyn_aimodelid) {
      throw new Error(`AI model '${modelName}' was not found. Ensure it is deployed in the app environment.`);
    }
    return record.msdyn_aimodelid;
  }
}
