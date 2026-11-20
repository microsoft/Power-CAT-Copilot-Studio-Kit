/**
 * AgentDescriptionService - generates a human-readable agent description from
 * the agent's instructions using the "Agent Inventory Generate Description"
 * AI Builder prompt.
 *
 * Mirrors the Conversation Analyzer AI Builder invocation pattern: look up the
 * model ID by name from `msdyn_aimodels`, then invoke the
 * `Microsoft.Dynamics.CRM.Predict` bound action via
 * MicrosoftDataverseService.PerformBoundActionWithOrganization.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';

/** AI Builder prompt name as deployed in the solution. */
const MODEL_NAME = 'Agent Inventory Generate Description';

/** Input variable name defined by the AI Builder prompt. */
const INSTRUCTIONS_INPUT_KEY = 'AgentInstructions';

interface PredictResponse {
  responsev2?: {
    predictionOutput?: {
      text?: string;
      structuredOutput?: Record<string, unknown>;
    };
  };
}

/** Dataverse response shape for an msdyn_aimodels record. */
interface AiModelRecord {
  msdyn_aimodelid: string;
  msdyn_name: string;
}

interface AiModelListResponse {
  value?: AiModelRecord[];
  msdyn_aimodelid?: string;
}

/**
 * Memoized model-ID lookup. The promise is cached so the model lookup runs
 * exactly once per browser session and is shared by concurrent callers; it is
 * cleared on failure so a later attempt can retry.
 */
let modelIdPromise: Promise<string> | undefined;

export class AgentDescriptionService {
  /**
   * Generate a description for an agent from its authored instructions.
   * @param instructions The agent's instructions text.
   * @returns The generated description, or an empty string when none was produced.
   */
  static async generate(instructions: string): Promise<string> {
    const modelId = await AgentDescriptionService.fetchModelId();
    const payload = AgentDescriptionService.buildPayload(instructions);

    const result = await MicrosoftDataverseService.PerformBoundActionWithOrganization(
      'current',
      'msdyn_aimodels',
      'Microsoft.Dynamics.CRM.Predict',
      modelId,
      payload,
    );

    if (!result.success || !result.data) {
      const message = (result.error as { message?: string })?.message ?? 'AI Builder predict call failed';
      throw new Error(message);
    }

    const output = (result.data as unknown as PredictResponse).responsev2?.predictionOutput;
    return AgentDescriptionService.extractDescription(output);
  }

  /** Build the Predict payload passing the instructions as the prompt input. */
  private static buildPayload(instructions: string): Record<string, unknown> {
    return {
      version: '2.0',
      source: JSON.stringify({
        consumptionSource: 'Api',
        partnerSource: 'AIBuilder',
        consumptionSourceVersion: 'GptApiClient',
      }),
      requestv2: {
        '@odata.type': '#Microsoft.Dynamics.CRM.expando',
        [INSTRUCTIONS_INPUT_KEY]: instructions,
        $customConfig: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          settings: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            runtime: null,
          },
        },
      },
    };
  }

  /**
   * Extract the generated description from the prediction output. The prompt
   * returns a JSON string shaped like `{"description": "..."}` in `text`; parse
   * it and read the `description` field. As a defensive fallback (consistent
   * with how AI Builder can surface parsed output), also read
   * `structuredOutput.description`.
   */
  private static extractDescription(
    output?: { text?: string; structuredOutput?: Record<string, unknown> },
  ): string {
    if (!output) return '';

    if (typeof output.text === 'string' && output.text.trim()) {
      const fromText = AgentDescriptionService.readDescriptionField(output.text.trim());
      if (fromText) return fromText;
    }

    const structuredDescription = output.structuredOutput?.description;
    if (typeof structuredDescription === 'string') return structuredDescription.trim();

    return '';
  }

  /**
   * Read the `description` field from a JSON string like `{"description": "..."}`.
   * Returns an empty string when the JSON is invalid, has no description, or the
   * description is blank.
   */
  private static readDescriptionField(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { description?: unknown };
      if (typeof parsed.description === 'string') return parsed.description.trim();
      return '';
    } catch {
      return '';
    }
  }

  /** Look up the AI Builder model ID by name, once per session (shared promise). */
  private static fetchModelId(): Promise<string> {
    if (!modelIdPromise) {
      modelIdPromise = AgentDescriptionService.lookupModelId().catch((error: unknown) => {
        modelIdPromise = undefined;
        throw error;
      });
    }
    return modelIdPromise;
  }

  /** Perform the actual msdyn_aimodels lookup for the configured model name. */
  private static async lookupModelId(): Promise<string> {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      'current',
      'msdyn_aimodels',
      undefined,
      undefined,
      undefined,
      undefined,
      'msdyn_aimodelid,msdyn_name',
      `msdyn_name eq '${MODEL_NAME}'`,
    );

    if (!result.success) {
      throw new Error(
        `Failed to look up AI model '${MODEL_NAME}'. ` +
        `Error: ${(result.error as { message?: string })?.message ?? 'Unknown error'}. ` +
        'Ensure connector permissions include read access to msdyn_aimodels.',
      );
    }

    const data = result.data as unknown as AiModelListResponse | AiModelRecord[] | AiModelRecord;
    let records: AiModelRecord[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (data && 'value' in data && Array.isArray(data.value)) {
      records = data.value;
    } else if (data && 'msdyn_aimodelid' in data) {
      records = [data as AiModelRecord];
    }

    const modelId = records[0]?.msdyn_aimodelid ?? '';
    if (!modelId) {
      throw new Error(
        `AI model '${MODEL_NAME}' not found in this environment. ` +
        'Ensure the Agent Inventory solution with this AI Builder prompt is deployed.',
      );
    }

    return modelId;
  }
}
