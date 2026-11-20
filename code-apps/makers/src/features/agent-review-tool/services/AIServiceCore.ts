/**
 * AIService
 *
 * Wrapper for PredictV2 AI model invocations via Microsoft Dataverse connector.
 *
 * Key features:
 * - Stage D: PDF Generation (AI model 23c0ffb9-139c-4f07-afe8-4d3c7c847f95)
 * - Structured skill bundle evaluation (P2-N, P2-R, P2-F, P2-B)
 * - Retry logic with exponential backoff
 * - Entitlement fallback: PVA (Copilot Credits) → AIBuilder (legacy credits)
 * - Comprehensive error handling
 */

import { AI_MODEL_IDS, UNPROVISIONED_AI_MODEL_ID } from '../contracts/Constants';
import type {
  ReviewReportData,
  PdfReportOutput,
} from '../contracts/StageOutputs';
import type { ResourceChunk } from '../agents-experience/contracts/SkillBundle';
import type { GroundedSkillFinding } from '../agents-experience/contracts/Findings';
import type {
  StandardSkillBundleEvaluation,
  ResourceChunkEvaluation,
  SkillResourceEvaluation,
  DeepSkillBundleEvaluation,
  CrossSkillOrchestrationEvaluation,
} from '../agents-experience/contracts/SkillEvaluation';
import type {
  StandardPromptPayload,
  ResourcePromptPayload,
  FileSynthesisPromptPayload,
  BundleSynthesisPromptPayload,
  OrchestrationPromptPayload,
} from '../agents-experience/services/skill/SkillPromptPayloadBuilder';
import {
  validateStandardEvaluation,
  validateChunkEvaluation,
  validateResourceEvaluation,
  validateDeepBundleEvaluation,
  validateOrchestrationEvaluation,
  type StandardValidationResult,
  type ChunkValidationResult,
  type ResourceValidationResult,
  type DeepBundleValidationResult,
  type OrchestrationValidationResult,
} from '../agents-experience/services/skill/SkillEvaluationValidator';

/**
 * Partner source for PredictV2 entitlement routing.
 * - 'PVA': Copilot Credits (future-proof, required after Nov 2026)
 * - 'AIBuilder': Legacy AI Builder credits (sunset Nov 2026)
 */
type PartnerSource = 'PVA' | 'AIBuilder';

/** Preferred source order: try PVA first, fall back to AIBuilder */
const PARTNER_SOURCE_PRIORITY: readonly PartnerSource[] = ['PVA', 'AIBuilder'];

/**
 * Error response structure from PredictV2
 */
interface PredictV2Error {
  status?: number;
  message?: string;
}

/**
 * PredictV2 response structure
 */
interface PredictV2Response {
  responsev2?: {
    predictionOutput?: {
      text?: string;
      files?: Array<{
        base64_content: string;
        file_name?: string;
        content_type?: string;
      }>;
    };
  };
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

// ---------------------------------------------------------------------------
// Structured output extractor
// ---------------------------------------------------------------------------

function normalizeAiBuilderStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalizedItems = value.map(normalizeAiBuilderStructuredValue);
    if (
      normalizedItems.every(
        (item) =>
          typeof item === 'object'
          && item !== null
          && Object.keys(item).length === 1
          && Object.prototype.hasOwnProperty.call(item, 'item'),
      )
    ) {
      return normalizedItems.map((item) => (item as { item: unknown }).item);
    }
    return normalizedItems;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeAiBuilderStructuredValue(item),
      ]),
    );
  }

  return value;
}

/**
 * Extracts typed structured output from a PredictV2 response.
 *
 * Resolution order:
 * 1. AI Builder structured JSON output (`responsev2.predictionOutput.structuredOutput`)
 * 2. JSON string stored in `predictionOutput` itself (legacy top-level string)
 * 3. JSON text in `predictionOutput.text`
 * 4. The `predictionOutput` object as-is (passthrough)
 *
 * Throws explicitly when `predictionOutput` is absent or JSON parsing fails.
 *
 * @param data - The raw PredictV2 response payload.
 * @returns The parsed structured output cast to `T`.
 */
export function extractStructuredOutput<T>(data: unknown): T {
  const response = data as { responsev2?: { predictionOutput?: unknown } };
  const output = response.responsev2?.predictionOutput;
  if (!output) throw new Error("No prediction output received");
  if (typeof output === "string") {
    return normalizeAiBuilderStructuredValue(JSON.parse(output)) as T;
  }
  const object = output as Record<string, unknown>;
  if (object.structuredOutput && typeof object.structuredOutput === "object") {
    return normalizeAiBuilderStructuredValue(object.structuredOutput) as T;
  }
  if (typeof object.text === "string" && object.text.trim()) {
    return normalizeAiBuilderStructuredValue(JSON.parse(object.text)) as T;
  }
  return normalizeAiBuilderStructuredValue(object) as T;
}

/**
 * AIService implementation
 *
 * Entitlement fallback strategy:
 * - First PredictV2 call tries 'PVA' (Copilot Credits — future-proof, required after Nov 2026)
 * - If a capacity/entitlement error is returned, retries immediately with 'AIBuilder'
 *   (legacy AI Builder credits — still valid during the transition period)
 * - The resolved source is cached for the remainder of the review run so all stages
 *   use the same entitlement pool
 */
/** Transport for the existing bound Predict action, independent of the browser SDK. */
export type PredictTransport = (
  modelId: string, payload: Record<string, unknown>,
) => Promise<PredictResult>;

export interface PredictResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string; status?: number };
}

export type ReviewModelIds = { [K in keyof typeof AI_MODEL_IDS]: string };

export class AIServiceCore {
  private readonly predict: PredictTransport;
  private readonly retryConfig: RetryConfig;
  private readonly modelIds: ReviewModelIds;

  /** Inject the bound action; durable hosts disable automatic retries and journal individual effects. */
  constructor(predict: PredictTransport, options: { retry?: RetryConfig; modelIds?: ReviewModelIds } = {}) {
    this.predict = predict;
    this.retryConfig = options.retry ?? DEFAULT_RETRY_CONFIG;
    this.modelIds = options.modelIds ?? AI_MODEL_IDS;
  }
  /**
   * Resolved partner source for this review run.
   * null = not yet determined; set after the first successful PredictV2 call.
   */
  private resolvedPartnerSource: PartnerSource | null = null;

  /**
   * Reset the cached partner source. Call at the start of a new review run
   * so that entitlement is re-evaluated (e.g. if admin provisions Copilot Credits
   * between runs).
   */
  resetPartnerSource(): void {
    this.resolvedPartnerSource = null;
  }

  /**
   * Invoke Stage D: PDF Report Generation
   *
   * Invokes AI model to generate PDF report from review data.
   *
   * @param reportData - Complete review report data
   * @returns PDF report output with base64 content
   *
   * @example
   * ```ts
   * const pdfOutput = await aiService.invokeStageD(reportData);
   * const pdfBytes = Uint8Array.from(atob(pdfOutput.base64Content), c => c.charCodeAt(0));
   * ```
   */
  async invokeStageD(reportData: ReviewReportData): Promise<PdfReportOutput> {
    try {
      const result = await this.invokePredictV2WithFallback(
        this.modelIds.STAGE_D_PDF_GENERATION,
        (partnerSource) => ({
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
        }),
        {
          ...DEFAULT_RETRY_CONFIG,
          maxDelayMs: 60000, // Extended timeout for PDF generation
        }
      );

      if (!result.success) {
        throw new Error(
          result.error?.message ?? 'Stage D execution failed'
        );
      }

      const response = result.data as PredictV2Response;
      const files = response.responsev2?.predictionOutput?.files;
      if (!files || files.length === 0) {
        throw new Error('No PDF file received from Stage D model');
      }

      return {
        base64Content: files[0].base64_content,
        fileName: files[0].file_name || 'agent_review_report.pdf',
        contentType: files[0].content_type || 'application/pdf',
      };
    } catch (error) {
      console.error('Stage D execution error:', error);
      throw error;
    }
  }

  /**
   * Invoke PredictV2 with entitlement fallback and retry logic.
   *
   * Resolution strategy:
   * 1. If a partner source was already resolved for this run, use it directly.
   * 2. Otherwise, try sources in priority order (PVA → AIBuilder).
   *    On capacity/entitlement errors, immediately try the next source without
   *    exponential backoff (those errors are permanent for that source).
   * 3. Cache the first source that succeeds for subsequent stages.
   *
   * @param modelId - AI Model ID (GUID)
   * @param buildPayload - Function that builds the request payload given a partner source
   * @param config - Retry configuration (for transient errors within a source)
   * @returns Operation result from the successful source
   */
  private async invokePredictV2WithFallback(
    modelId: string,
    buildPayload: (partnerSource: PartnerSource) => Record<string, unknown>,
    config: RetryConfig = this.retryConfig
  ): Promise<PredictResult> {
    // If already resolved, go straight to the known-good source
    if (this.resolvedPartnerSource) {
      console.info(
        `[Agent Review] Using cached partner source: '${this.resolvedPartnerSource}'`
      );
      return this.invokePredictV2WithRetry(
        modelId,
        buildPayload(this.resolvedPartnerSource),
        config
      );
    }

    // Try sources in priority order
    console.info(
      `[Agent Review] Resolving AI entitlement — trying sources: ${PARTNER_SOURCE_PRIORITY.join(' → ')}`
    );
    let lastResult: PredictResult | undefined;

    for (const source of PARTNER_SOURCE_PRIORITY) {
      const payload = buildPayload(source);
      const result = await this.invokePredictV2WithRetry(modelId, payload, config);

      if (result.success) {
        this.resolvedPartnerSource = source;
        console.info(
          `[Agent Review] AI entitlement resolved: using '${source}' partner source`
        );
        return result;
      }

      // Check if this is a capacity/entitlement error — try next source
      const errorText = ((result.error as PredictV2Error)?.message ?? '').toLowerCase();
      const isCapacityError =
        errorText.includes('nocapacity') ||
        errorText.includes('entitlementnotavailable') ||
        errorText.includes('0x80048d06');

      if (isCapacityError) {
        console.warn(
          `[Agent Review] '${source}' capacity unavailable, trying next source...`
        );
        lastResult = result;
        continue;
      }

      // Non-capacity error — don't fallback, return the error as-is
      return result;
    }

    // All sources exhausted — return the last capacity error
    console.error(
      '[Agent Review] All entitlement sources exhausted (PVA and AIBuilder). ' +
      'No AI capacity available for this environment.'
    );
    return lastResult!;
  }

  /**
   * Invoke PredictV2 with retry logic
   *
   * Implements exponential backoff for transient failures.
   * Capacity/entitlement errors are returned immediately (no retry).
   *
   * @param modelId - AI Model ID (GUID)
   * @param requestPayload - Request payload
   * @param config - Retry configuration
   * @returns Operation result
   */
  private async invokePredictV2WithRetry(
    modelId: string,
    requestPayload: Record<string, unknown>,
    config: RetryConfig = this.retryConfig
  ): Promise<PredictResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await this.predict(modelId, requestPayload);

        // Success case
        if (result.success) {
          return result;
        }

        // Determine if error is retryable
        const predictError = result.error as PredictV2Error | undefined;
        const errorStatus = predictError?.status ?? (predictError?.message?.includes('timeout') ? 408 : 0);

        // Capacity / entitlement errors are permanent for this source —
        // return immediately so the fallback layer can try the next source.
        const errorText = (predictError?.message ?? '').toLowerCase();
        const isCapacityError =
          errorText.includes('nocapacity') ||
          errorText.includes('entitlementnotavailable') ||
          errorText.includes('0x80048d06');

        const isRetryable =
          !isCapacityError && (
            errorStatus === 0 || // Network error
            errorStatus === 408 || // Request Timeout
            errorStatus === 429 || // Too Many Requests
            errorStatus === 503 || // Service Unavailable
            errorStatus === 504 // Gateway Timeout
          );

        if (!isRetryable || attempt === config.maxAttempts) {
          return result; // Return error result without retry
        }

        // Calculate exponential backoff delay
        const delayMs = Math.min(
          config.baseDelayMs * Math.pow(2, attempt - 1),
          config.maxDelayMs
        );

        console.warn(
          `PredictV2 attempt ${attempt} failed (status ${errorStatus}). Retrying in ${delayMs}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (error) {
        lastError = error as Error;
        console.error(`PredictV2 attempt ${attempt} exception:`, error);

        if (attempt === config.maxAttempts) {
          throw lastError;
        }

        const delayMs = Math.min(
          config.baseDelayMs * Math.pow(2, attempt - 1),
          config.maxDelayMs
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError ?? new Error('PredictV2 retry exhausted');
  }

  /**
   * Spec 013 P2: invoke the Skill Bundle Evaluator prompt (JSON output mode).
   * Returns the parsed SkillBundleEvaluation. Throws on failure so the
   * orchestrator can degrade to deterministic-only for that skill.
   */
  async invokeSkillBundleEvaluator(input: {
    skillMarkdown: string; agentInstructions: string; siblingDescriptions: string; skillResources: string;
  }): Promise<import('../agents-experience/contracts/SkillEvaluation').SkillBundleEvaluation> {
    const result = await this.invokePredictV2WithFallback(
      this.modelIds.SKILL_BUNDLE_EVAL,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          skill_markdown: input.skillMarkdown,
          agent_instructions: input.agentInstructions,
          sibling_descriptions: input.siblingDescriptions,
          skill_resources: input.skillResources,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      })
    );
    if (!result.success) throw new Error(result.error?.message ?? 'Skill evaluator failed');
    const response = result.data as PredictV2Response;
    const text = response.responsev2?.predictionOutput?.text;
    if (!text) throw new Error('No output from skill evaluator');
    return JSON.parse(text) as import('../agents-experience/contracts/SkillEvaluation').SkillBundleEvaluation;
  }

  /**
   * Spec 013 P1: invoke the Copilot Instruction Coverage classifier (JSON output mode).
   */
  async invokeInstructionCoverage(
    instructions: string, capabilityNames: string
  ): Promise<import('../agents-experience/contracts/AiCoverage').InstructionCoverageResult> {
    const result = await this.invokePredictV2WithFallback(
      this.modelIds.INSTRUCTION_COVERAGE,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          instructions_input: instructions,
          capability_names: capabilityNames,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      })
    );
    if (!result.success) throw new Error(result.error?.message ?? 'Instruction coverage failed');
    const response = result.data as PredictV2Response;
    const text = response.responsev2?.predictionOutput?.text;
    if (!text) throw new Error('No output from instruction coverage');
    return JSON.parse(text) as import('../agents-experience/contracts/AiCoverage').InstructionCoverageResult;
  }

  // ---------------------------------------------------------------------------
  // Structured P2 skill evaluation methods (Task 7)
  // ---------------------------------------------------------------------------

  /**
   * Guard that throws explicitly when a model ID is the unprovisioned zero GUID.
   * Called before every structured invocation to avoid wasting connector calls.
   */
  private assertProvisioned(modelId: string, label: string): void {
    if (modelId === UNPROVISIONED_AI_MODEL_ID) {
      throw new Error(`AI prompt "${label}" is not provisioned (model ID is zero GUID).`);
    }
  }

  /**
   * Returns true when the given model ID is provisioned (not the zero GUID).
   * Callers use this to skip optional AI passes gracefully when unprovisioned.
   */
  isProvisioned(modelId: string): boolean {
    return modelId !== UNPROVISIONED_AI_MODEL_ID;
  }

  /**
   * Spec 013 P2-N (v2): Invoke the Standard Skill Bundle Evaluator prompt.
   *
   * Uses the exact variable names from Task 6 `buildStandardPromptInput`.
   * Extracts structured output and validates through `validateStandardEvaluation`.
   *
   * @param payload - Standard prompt payload from `buildStandardPromptInput`.
   * @param sourceCorpus - Combined skill markdown + resource text for evidence grounding.
   * @returns Validated standard evaluation result with any dropped findings reported as issues.
   */
  async invokeStandardSkillBundleEvaluator(
    payload: StandardPromptPayload,
    sourceCorpus: string,
  ): Promise<StandardValidationResult> {
    this.assertProvisioned(this.modelIds.SKILL_BUNDLE_EVAL, 'SKILL_BUNDLE_EVAL');

    const result = await this.invokePredictV2WithFallback(
      this.modelIds.SKILL_BUNDLE_EVAL,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          skill_markdown: payload.skill_markdown,
          agent_instructions: payload.agent_instructions,
          sibling_descriptions_json: payload.sibling_descriptions_json,
          resource_manifest_json: payload.resource_manifest_json,
          resource_excerpts_json: payload.resource_excerpts_json,
          deterministic_findings_json: payload.deterministic_findings_json,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      }),
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Standard skill bundle evaluator failed');
    }

    const evaluation = extractStructuredOutput<StandardSkillBundleEvaluation>(result.data);
    const deterministicFindings = JSON.parse(
      payload.deterministic_findings_json,
    ) as GroundedSkillFinding[];
    return validateStandardEvaluation(
      evaluation,
      sourceCorpus,
      deterministicFindings,
    );
  }

  /**
   * Spec 013 P2-O: Invoke the Cross-Skill Orchestration Evaluator prompt.
   *
   * Agent-level pass: runs once per review with the whole skill set in context.
   * Uses the exact variable names from `buildOrchestrationPromptInput`. Extracts
   * structured output and validates through `validateOrchestrationEvaluation`.
   *
   * @param payload - Orchestration prompt payload from `buildOrchestrationPromptInput`.
   * @param knownSkills - Skill names in the review (for skill-name validation).
   * @param sourceCorpus - Combined skill text for evidence grounding.
   * @returns Validated orchestration evaluation with any dropped findings reported as issues.
   */
  async invokeCrossSkillOrchestrator(
    payload: OrchestrationPromptPayload,
    knownSkills: string[],
    sourceCorpus: string,
  ): Promise<OrchestrationValidationResult> {
    this.assertProvisioned(
      this.modelIds.SKILL_CROSS_SKILL_ORCHESTRATION,
      'SKILL_CROSS_SKILL_ORCHESTRATION',
    );

    const result = await this.invokePredictV2WithFallback(
      this.modelIds.SKILL_CROSS_SKILL_ORCHESTRATION,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          agent_instructions: payload.agent_instructions,
          skills_json: payload.skills_json,
          orchestration_rules_json: payload.orchestration_rules_json,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      }),
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Cross-skill orchestration evaluator failed');
    }

    const evaluation = extractStructuredOutput<CrossSkillOrchestrationEvaluation>(result.data);
    return validateOrchestrationEvaluation(evaluation, knownSkills, sourceCorpus);
  }

  /**
   * Spec 013 P2-R: Invoke the Resource Chunk Evaluator prompt.
   *
   * Uses the exact variable names from Task 6 `buildResourcePromptInput`.
   * Extracts structured output and validates through `validateChunkEvaluation`.
   *
   * @param payload - Resource prompt payload from `buildResourcePromptInput`.
   * @param chunk - The original resource chunk submitted (used for evidence grounding).
   * @returns Validated chunk evaluation with validated findings and any issues.
   */
  async invokeSkillResourceChunkEvaluator(
    payload: ResourcePromptPayload,
    chunk: ResourceChunk,
  ): Promise<ChunkValidationResult> {
    this.assertProvisioned(this.modelIds.SKILL_RESOURCE_EVAL, 'SKILL_RESOURCE_EVAL');

    const result = await this.invokePredictV2WithFallback(
      this.modelIds.SKILL_RESOURCE_EVAL,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          skill_context_json: payload.skill_context_json,
          resource_metadata_json: payload.resource_metadata_json,
          resource_chunk: payload.resource_chunk,
          chunk_context_json: payload.chunk_context_json,
          deterministic_findings_json: payload.deterministic_findings_json,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      }),
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Resource chunk evaluator failed');
    }

    const evaluation = extractStructuredOutput<ResourceChunkEvaluation>(result.data);
    return validateChunkEvaluation(evaluation, chunk);
  }

  /**
   * Spec 013 P2-F: Invoke the Skill File Synthesizer prompt.
   *
   * Uses the exact variable names from Task 6 `buildFileSynthesisPromptInput`.
   * Extracts structured output and validates through `validateResourceEvaluation`.
   *
   * @param payload - File synthesis payload from `buildFileSynthesisPromptInput`.
   * @param knownPaths - Valid resource paths from the bundle manifest.
   * @param sourceCorpus - Combined chunk content for evidence grounding.
   * @returns Validated resource evaluation with any dropped findings reported as issues.
   */
  async invokeSkillFileSynthesizer(
    payload: FileSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ): Promise<ResourceValidationResult> {
    this.assertProvisioned(this.modelIds.SKILL_FILE_SYNTHESIS, 'SKILL_FILE_SYNTHESIS');

    const result = await this.invokePredictV2WithFallback(
      this.modelIds.SKILL_FILE_SYNTHESIS,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          resource_metadata_json: payload.resource_metadata_json,
          chunk_results_json: payload.chunk_results_json,
          deterministic_findings_json: payload.deterministic_findings_json,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      }),
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Skill file synthesizer failed');
    }

    const evaluation = extractStructuredOutput<SkillResourceEvaluation>(result.data);
    return validateResourceEvaluation(evaluation, knownPaths, sourceCorpus);
  }

  /**
   * Spec 013 P2-B: Invoke the Deep Skill Bundle Synthesizer prompt.
   *
   * Uses the exact variable names from Task 6 `buildBundleSynthesisPromptInput`.
   * Extracts structured output and validates through `validateDeepBundleEvaluation`.
   *
   * @param payload - Bundle synthesis payload from `buildBundleSynthesisPromptInput`.
   * @param knownPaths - Valid resource paths from the bundle manifest.
   * @param sourceCorpus - Combined evidence text for grounding.
   * @returns Validated deep bundle evaluation with any dropped findings reported as issues.
   */
  async invokeDeepSkillBundleSynthesizer(
    payload: BundleSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ): Promise<DeepBundleValidationResult> {
    this.assertProvisioned(this.modelIds.SKILL_DEEP_BUNDLE_SYNTHESIS, 'SKILL_DEEP_BUNDLE_SYNTHESIS');

    const result = await this.invokePredictV2WithFallback(
      this.modelIds.SKILL_DEEP_BUNDLE_SYNTHESIS,
      (partnerSource) => ({
        version: '2.0',
        source: JSON.stringify({ consumptionSource: 'Api', partnerSource, consumptionSourceVersion: 'GptApiClient' }),
        requestv2: {
          '@odata.type': '#Microsoft.Dynamics.CRM.expando',
          skill_markdown: payload.skill_markdown,
          agent_instructions: payload.agent_instructions,
          sibling_descriptions_json: payload.sibling_descriptions_json,
          resource_manifest_json: payload.resource_manifest_json,
          resource_results_json: payload.resource_results_json,
          bundle_integrity_json: payload.bundle_integrity_json,
          deterministic_findings_json: payload.deterministic_findings_json,
          skill_markdown_analysis_json: payload.skill_markdown_analysis_json,
          synthesis_level: payload.synthesis_level,
          $customConfig: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            settings: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', runtime: null },
          },
        },
      }),
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Deep skill bundle synthesizer failed');
    }

    const evaluation = extractStructuredOutput<DeepSkillBundleEvaluation>(result.data);
    const deterministicFindings = JSON.parse(
      payload.deterministic_findings_json,
    ) as GroundedSkillFinding[];
    return validateDeepBundleEvaluation(
      evaluation,
      knownPaths,
      sourceCorpus,
      deterministicFindings,
    );
  }

}

// Export singleton instance
