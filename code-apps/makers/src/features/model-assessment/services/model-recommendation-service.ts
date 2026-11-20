/**
 * Runs the model recommendation prompt (AI Builder Predict on msdyn_aimodels)
 * for a two-run comparison.
 */
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { listDataverseRows } from '../../../shared/services/dataversePaging';
import {
  parseRecommendation,
  RECOMMENDATION_PROMPT_INPUT,
  RECOMMENDATION_PROMPT_NAME,
  type ModelRecommendation,
  type RecommendationPayload,
} from '../contracts/model-recommendation';

const ORG = 'current';
/** Copilot Credits first, then AI Builder capacity, as the Agent Review Tool does. */
const PARTNER_SOURCES = ['PVA', 'AIBuilder'] as const;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;
const RETRYABLE_STATUS = new Set([0, 408, 429, 503, 504]);

type PartnerSource = (typeof PARTNER_SOURCES)[number];

/** The prompt is not in this environment, or it has no capacity to run. */
export class RecommendationUnavailableError extends Error {}

let modelIdPromise: Promise<string> | undefined;
let resolvedSource: PartnerSource | undefined;

async function lookupModelId(): Promise<string> {
  const rows = await listDataverseRows(ORG, 'msdyn_aimodels', {
    select: 'msdyn_aimodelid',
    filter: `msdyn_name eq '${RECOMMENDATION_PROMPT_NAME}' and statecode eq 1`,
  });
  const id = rows[0]?.['msdyn_aimodelid'];
  if (typeof id !== 'string' || !id) {
    throw new RecommendationUnavailableError(
      `The "${RECOMMENDATION_PROMPT_NAME}" AI prompt isn't published in this environment. Import or update the Model Assessment solution.`,
    );
  }
  return id;
}

function modelId(): Promise<string> {
  modelIdPromise ??= lookupModelId().catch((error: unknown) => {
    modelIdPromise = undefined;
    throw error;
  });
  return modelIdPromise;
}

function payloadFor(source: PartnerSource, data: RecommendationPayload) {
  return {
    version: '2.0',
    source: JSON.stringify({ consumptionSource: 'Api', partnerSource: source, consumptionSourceVersion: 'GptApiClient' }),
    requestv2: {
      '@odata.type': '#Microsoft.Dynamics.CRM.expando',
      [RECOMMENDATION_PROMPT_INPUT]: JSON.stringify(data),
      $customConfig: {
        '@odata.type': '#Microsoft.Dynamics.CRM.expando',
        settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
      },
    },
  };
}

interface PredictError { message: string; status: number }

const errorOf = (error: unknown): PredictError => {
  const value = error as { message?: unknown; status?: unknown } | undefined;
  const message = typeof value?.message === 'string' ? value.message : String(error ?? 'The AI prompt failed.');
  const status = typeof value?.status === 'number' ? value.status : /timeout/i.test(message) ? 408 : 0;
  return { message, status };
};

const isCapacityError = (message: string) => /nocapacity|entitlementnotavailable|0x80048d06|quotaexceeded/i.test(message);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function predictOnce(id: string, source: PartnerSource, data: RecommendationPayload): Promise<unknown> {
  let last: PredictError = { message: 'The AI prompt failed.', status: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await MicrosoftDataverseService.PerformBoundActionWithOrganization(
        ORG, 'msdyn_aimodels', 'Microsoft.Dynamics.CRM.Predict', id, payloadFor(source, data),
      );
      if (result.success && result.data) return result.data;
      last = errorOf(result.error);
    } catch (error) {
      last = errorOf(error);
    }
    if (isCapacityError(last.message) || !RETRYABLE_STATUS.has(last.status) || attempt === MAX_ATTEMPTS) break;
    await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
  }
  throw Object.assign(new Error(last.message), { status: last.status });
}

/** Read the prompt output from a Predict response: structured JSON first, then JSON text. */
export function predictionOutput(response: unknown): unknown {
  const output = (response as { responsev2?: { predictionOutput?: unknown } } | undefined)?.responsev2?.predictionOutput;
  if (output === undefined || output === null) throw new Error('The AI prompt returned no output.');
  if (typeof output === 'string') return output;
  const value = output as { structuredOutput?: unknown; text?: unknown };
  if (value.structuredOutput && typeof value.structuredOutput === 'object') return value.structuredOutput;
  if (typeof value.text === 'string') return value.text;
  return output;
}

/**
 * Ask the recommendation prompt which model the comparison favours.
 * Tries Copilot Credits, then AI Builder capacity; transient failures are retried.
 */
export async function requestModelRecommendation(
  data: RecommendationPayload,
): Promise<ModelRecommendation> {
  const id = await modelId();
  const sources = resolvedSource
    ? [resolvedSource, ...PARTNER_SOURCES.filter((source) => source !== resolvedSource)]
    : PARTNER_SOURCES;
  let capacityError: Error | undefined;
  for (const source of sources) {
    try {
      const response = await predictOnce(id, source, data);
      resolvedSource = source;
      return parseRecommendation(predictionOutput(response), data.decision);
    } catch (error) {
      const message = errorOf(error).message;
      if (!isCapacityError(message)) throw error;
      capacityError = error as Error;
    }
  }
  throw new RecommendationUnavailableError(
    capacityError ? 'No capacity is available to run AI prompts in this environment.' : 'The AI prompt failed.',
  );
}

/** Test hook: forget the cached model id and partner source. */
export function resetRecommendationServiceCache() {
  modelIdPromise = undefined;
  resolvedSource = undefined;
}
