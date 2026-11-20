/**
 * DAEvaluationService.ts
 *
 * Stage B AI invocation for DA quality evaluation.
 * Uses PerformBoundActionWithOrganization (NOT PredictV2) to support cross-org evaluation.
 *
 * Entitlement fallback strategy:
 * - Tries 'PVA' (Copilot Credits — future-proof, required after Nov 2026) first
 * - On capacity/entitlement error, falls back to 'AIBuilder' (legacy credits)
 * - Resolved source is cached for the review run
 *
 * The DA Quality Evaluator model is configured with JSON output mode in AI Builder —
 * the response is returned as a structured object directly (no JSON.parse needed).
 */

import { MicrosoftDataverseService } from '../../../../generated/services/MicrosoftDataverseService';
import type { DAManifest } from '../contracts/DAManifest';
import type { DAEvaluationResult } from '../contracts/DAEvaluationResult';
import { DA_AI_MODEL_IDS, DA_RETRY_CONFIG, DA_TIMEOUTS } from '../contracts/constants';
import { MOCK_DA_EVALUATION } from './mockData';

const TEST_MODE = import.meta.env.VITE_DA_REVIEW_TEST_MODE === 'true';

type PartnerSource = 'PVA' | 'AIBuilder';
const PARTNER_SOURCE_PRIORITY: readonly PartnerSource[] = ['PVA', 'AIBuilder'];

/** Resolved partner source for this review run (module-level cache). */
let resolvedPartnerSource: PartnerSource | null = null;

/** Reset the cached partner source (call at the start of each review run). */
export function resetDAPartnerSource(): void {
  resolvedPartnerSource = null;
}

interface PredictV2Error {
  status?: number;
  message?: string;
}

function isCapacityError(errorMessage: string): boolean {
  const text = errorMessage.toLowerCase();
  return (
    text.includes('nocapacity') ||
    text.includes('entitlementnotavailable') ||
    text.includes('0x80048d06')
  );
}

/**
 * Invokes Stage B: DA Quality Evaluator AI model.
 *
 * @param manifest - Parsed DA manifest
 * @param orgUrl - Optional org URL for cross-environment evaluation
 * @returns Complete DA evaluation result
 */
export async function evaluateDA(
  manifest: DAManifest,
  orgUrl?: string
): Promise<DAEvaluationResult> {
  // orgUrl is accepted for API compatibility but intentionally unused: the AI
  // model always runs in the current environment (see note below).
  void orgUrl;

  if (TEST_MODE) {
    console.log('[DA TEST MODE] Returning mock Stage B evaluation');
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate latency
    return MOCK_DA_EVALUATION;
  }

  // Strip iconBase64 to keep payload small
  const manifestForEval = { ...manifest, iconBase64: undefined };
  const modelId = DA_AI_MODEL_IDS.STAGE_B_DA_EVAL;

  const buildPayload = (partnerSource: PartnerSource) => ({
    version: '2.0',
    source: JSON.stringify({
      consumptionSource: 'Api',
      partnerSource,
      consumptionSourceVersion: 'GptApiClient',
    }),
    requestv2: {
      '@odata.type': '#Microsoft.Dynamics.CRM.expando',
      da_manifest: JSON.stringify(manifestForEval),
      $customConfig: {
        '@odata.type': '#Microsoft.Dynamics.CRM.expando',
        settings: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          runtime: null,
        },
      },
    },
  });

  // The AI model is always deployed in the current environment — never the cross-org URL.
  // orgUrl is only relevant for fetching the agent manifest (Graph API / catalog), not for
  // invoking the AI model. Passing a cross-org URL here causes:
  // "Connection reference not found: commondataserviceforapps"

  // If already resolved, use the known-good source
  if (resolvedPartnerSource) {
    console.info(`[DA Review] Using cached partner source: '${resolvedPartnerSource}'`);
    return await invokeWithRetry(modelId, buildPayload(resolvedPartnerSource), 'current');
  }

  // Try sources in priority order
  console.info(
    `[DA Review] Resolving AI entitlement — trying sources: ${PARTNER_SOURCE_PRIORITY.join(' → ')}`
  );
  for (const source of PARTNER_SOURCE_PRIORITY) {
    try {
      const result = await invokeWithRetry(modelId, buildPayload(source), 'current');
      resolvedPartnerSource = source;
      console.info(`[DA Review] AI entitlement resolved: using '${source}' partner source`);
      return result;
    } catch (error) {
      const errorMsg = (error as Error).message ?? '';
      if (isCapacityError(errorMsg)) {
        console.warn(`[DA Review] '${source}' capacity unavailable, trying next source...`);
        continue;
      }
      // Non-capacity error — don't fallback
      throw error;
    }
  }

  throw new Error(
    'DA Stage B: All entitlement sources exhausted (PVA and AIBuilder). ' +
    'No AI capacity available for this environment.'
  );
}

/**
 * Invokes Stage D: PDF report generation.
 *
 * Uses the same PDF model as CS agent Stage D.
 * Respects the partner source resolved during Stage B evaluation.
 *
 * @param reportData - Serialized report data
 * @returns PDF bytes as Uint8Array
 */
export async function generateDAPdf(reportData: Record<string, unknown>): Promise<Uint8Array> {
  if (TEST_MODE) {
    console.log('[DA TEST MODE] Returning mock PDF blob');
    return new Uint8Array(0);
  }

  const buildPayload = (partnerSource: PartnerSource) => ({
    version: '2.0',
    source: JSON.stringify({
      consumptionSource: 'Api',
      partnerSource,
      consumptionSourceVersion: 'GptApiClient',
    }),
    requestv2: {
      '@odata.type': '#Microsoft.Dynamics.CRM.expando',
      report_data: JSON.stringify(reportData),
      $customConfig: {
        '@odata.type': '#Microsoft.Dynamics.CRM.expando',
        settings: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          runtime: null,
        },
      },
    },
  });

  // Use resolved source from Stage B, or try fallback if not yet resolved
  const sourcesToTry: PartnerSource[] = resolvedPartnerSource
    ? [resolvedPartnerSource]
    : [...PARTNER_SOURCE_PRIORITY];

  let lastError: Error | undefined;

  for (const source of sourcesToTry) {
    const result = await MicrosoftDataverseService.PerformBoundActionWithOrganization(
      'current',
      'msdyn_aimodels',
      'Microsoft.Dynamics.CRM.Predict',
      DA_AI_MODEL_IDS.STAGE_D_PDF_GENERATION,
      buildPayload(source)
    );

    if (result.success) {
      if (!resolvedPartnerSource) {
        resolvedPartnerSource = source;
        console.info(`[DA Review] AI entitlement resolved (Stage D): using '${source}' partner source`);
      }

      const responseData = result.data as Record<string, unknown> | undefined;
      const responsev2 = responseData?.responsev2 as Record<string, unknown> | undefined;
      const predictionOutput = responsev2?.predictionOutput as Record<string, unknown> | undefined;
      const files = predictionOutput?.files as Array<{ base64_content: string }> | undefined;

      if (!files || files.length === 0) {
        throw new Error('DA Stage D: No PDF file received from model');
      }

      const pdfBase64 = files[0].base64_content;
      return Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    }

    const err = result.error as PredictV2Error | undefined;
    const errMsg = err?.message ?? '';

    if (isCapacityError(errMsg)) {
      console.warn(`[DA Review] Stage D: '${source}' capacity unavailable, trying next source...`);
      lastError = new Error(`DA Stage D failed: ${errMsg} (status ${err?.status ?? 0})`);
      continue;
    }

    throw new Error(`DA Stage D failed: ${errMsg} (status ${err?.status ?? 0})`);
  }

  throw lastError ?? new Error('DA Stage D: All entitlement sources exhausted');
}

/**
 * Retry wrapper for AI model invocations.
 */
async function invokeWithRetry(
  modelId: string,
  requestPayload: Record<string, unknown>,
  orgUrl: string
): Promise<DAEvaluationResult> {
  let lastError: Error | undefined;
  const timeoutMs = DA_TIMEOUTS.STAGE_B_MS;

  for (let attempt = 1; attempt <= DA_RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      const resultPromise = MicrosoftDataverseService.PerformBoundActionWithOrganization(
        orgUrl,
        'msdyn_aimodels',
        'Microsoft.Dynamics.CRM.Predict',
        modelId,
        requestPayload
      );

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DA Stage B timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);

      if (!result.success) {
        const err = result.error as PredictV2Error | undefined;
        const status = err?.status ?? 0;
        // Capacity / entitlement errors are permanent — never retry them.
        const errText = (err?.message ?? '').toLowerCase();
        const isCapacityError =
          errText.includes('nocapacity') ||
          errText.includes('entitlementnotavailable') ||
          errText.includes('0x80048d06');
        const isRetryable =
          !isCapacityError &&
          (status === 0 || status === 408 || status === 429 || status === 503 || status === 504);

        if (!isRetryable || attempt === DA_RETRY_CONFIG.maxAttempts) {
          throw new Error(`DA Stage B failed: ${err?.message ?? 'Unknown error'} (status ${status})`);
        }
      } else {
        return extractEvaluationResult(result.data as Record<string, unknown>);
      }
    } catch (error) {
      lastError = error as Error;
      console.error(`[DA Stage B] Attempt ${attempt} threw:`, error);
      if (attempt === DA_RETRY_CONFIG.maxAttempts) throw lastError;
    }

    const delay = Math.min(
      DA_RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
      DA_RETRY_CONFIG.maxDelayMs
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError ?? new Error('DA Stage B retry exhausted');
}

/**
 * Extracts DAEvaluationResult from raw API response.
 * JSON output mode returns structured object at predictionOutput root.
 */
export function extractEvaluationResult(data: Record<string, unknown>): DAEvaluationResult {
  const responsev2 = data?.responsev2 as Record<string, unknown> | undefined;
  const predictionOutput = responsev2?.predictionOutput;

  if (!predictionOutput) {
    throw new Error('DA Stage B: No prediction output received from model');
  }

  let raw: Record<string, unknown>;
  if (typeof predictionOutput === 'string') {
    try {
      raw = JSON.parse(predictionOutput) as Record<string, unknown>;
    } catch {
      throw new Error(`DA Stage B: Model returned text instead of JSON. Raw: ${String(predictionOutput).slice(0, 200)}`);
    }
  } else {
    const predictionObj = predictionOutput as Record<string, unknown>;

    // Model returns structured data in structuredOutput; fall back to parsing text field
    if (predictionObj.structuredOutput && typeof predictionObj.structuredOutput === 'object') {
      raw = predictionObj.structuredOutput as Record<string, unknown>;
    } else if (typeof predictionObj.text === 'string' && predictionObj.text.trim()) {
      try {
        raw = JSON.parse(predictionObj.text) as Record<string, unknown>;
      } catch {
        throw new Error(`DA Stage B: Failed to parse text field as JSON. Raw: ${String(predictionObj.text).slice(0, 200)}`);
      }
    } else {
      raw = predictionObj;
    }
  }

  // Normalize: ensure every criterion field exists with safe defaults.
  // score is intentionally omitted — it is derived client-side from status.
  const normalizeCriterion = (c: unknown): import('../contracts/DAEvaluationResult').CriterionResult => {
    if (c && typeof c === 'object') {
      const obj = c as Record<string, unknown>;
      const status = typeof obj.status === 'string' &&
        ['Pass', 'Warning', 'Fail', 'Not assessed'].includes(obj.status)
        ? obj.status as import('../contracts/DAEvaluationResult').EvaluationStatus
        : 'Not assessed';
      return {
        status,
        issues: Array.isArray(obj.issues) ? obj.issues : [],
        passingChecks: Array.isArray(obj.passingChecks) ? obj.passingChecks : [],
        assessmentNotes: status === 'Not assessed'
          ? [{
              status: 'Not assessed',
              description: 'The evaluator did not return a supported result for this criterion.',
            }]
          : undefined,
      };
    }
    return {
      status: 'Not assessed',
      issues: [],
      passingChecks: [],
      assessmentNotes: [{
        status: 'Not assessed',
        description: 'The evaluator did not return this criterion.',
      }],
    };
  };

  const evaluation: DAEvaluationResult = {
    instructionsCriterion: normalizeCriterion(raw.instructionsCriterion),
    knowledgeCriterion: normalizeCriterion(raw.knowledgeCriterion),
    capabilitiesCriterion: normalizeCriterion(raw.capabilitiesCriterion),
    actionsCriterion: normalizeCriterion(raw.actionsCriterion),
    conversationStartersCriterion: normalizeCriterion(raw.conversationStartersCriterion),
    gracefulErrorHandlingCriterion: normalizeCriterion(raw.gracefulErrorHandlingCriterion),
    summary: typeof raw.summary === 'string' ? raw.summary : '',
  };

  return evaluation;
}
