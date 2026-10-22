/**
 * Deep review Phase 2 (P2-F): file synthesis (spec 013 §9).
 *
 * Synthesizes chunk evaluation results into per-file evaluations.
 * Uses token-aware batching and bounded concurrency for oversized payloads.
 */
import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type {
  SkillBundle,
  SkillBundleResource,
  ResourceChunk,
} from "../../contracts/SkillBundle.js";
import type {
  SkillResourceEvaluation,
} from "../../contracts/SkillEvaluation.js";
import type { ChunkValidationResult, ResourceValidationResult } from "./SkillEvaluationValidator.js";
import type { DeepSkillReviewAiPort } from "./deepReviewHelpers.js";
import type { ResourceChunkResults } from "./deepResourceEvaluation.js";
import { buildFileSynthesisPromptInput } from "./SkillPromptPayloadBuilder.js";
import { mapWithConcurrency } from "./concurrency.js";
import {
  estimateTokens,
  FILE_SYNTHESIS_TOKEN_CEILING,
} from "./tokenBudget.js";
import {
  AI_CONCURRENCY,
  splitIntoBatchesByTokens,
  adaptSingleChunkToFileResult,
  mergeBatchFileResults,
  makeCancelledEvaluation,
} from "./deepReviewHelpers.js";

// ---------------------------------------------------------------------------
// Phase 2: P2-F file synthesis
// ---------------------------------------------------------------------------

export interface FileSynthesisResult {
  fileEvaluations: SkillResourceEvaluation[];
  hasPartialFailure: boolean;
}

/**
 * Synthesizes chunk evaluation results into per-file evaluations.
 *
 * @param chunkResultsByResource - Chunk results grouped by resource path.
 * @param skippedEvaluations - Pre-built evaluations for skipped resources.
 * @param findingsByResource - Pre-computed deterministic findings per resource.
 * @param bundle - The full skill bundle.
 * @param ai - AI port for file synthesis.
 * @param signal - Optional abort signal.
 */
export async function executeFileSynthesis(
  chunkResultsByResource: Map<string, ResourceChunkResults>,
  skippedEvaluations: SkillResourceEvaluation[],
  findingsByResource: Map<string, GroundedSkillFinding[]>,
  bundle: SkillBundle,
  ai: DeepSkillReviewAiPort,
  signal?: AbortSignal,
): Promise<FileSynthesisResult> {
  const knownPaths = bundle.resources.map((r) => r.normalizedPath);
  const fileEvaluations: SkillResourceEvaluation[] = [...skippedEvaluations];
  let hasPartialFailure = false;

  for (const [path, { resource, chunks, chunkResults: cr }] of chunkResultsByResource) {
    if (signal?.aborted) {
      fileEvaluations.push(makeCancelledEvaluation(path, chunks.length));
      continue;
    }

    // Collect successful chunk results
    const successfulResults: ChunkValidationResult[] = [];
    const successfulChunks: ResourceChunk[] = [];
    for (let i = 0; i < cr.length; i++) {
      if (cr[i].status === "fulfilled") {
        successfulResults.push((cr[i] as { status: "fulfilled"; value: ChunkValidationResult }).value);
        successfulChunks.push(chunks[i]);
      }
    }

    // All chunks failed → resource is failed
    if (successfulResults.length === 0) {
      hasPartialFailure = true;
      fileEvaluations.push({
        resourcePath: path,
        status: "failed",
        riskLevel: "none",
        readiness: "unknown",
        observedBehaviors: [],
        dependencies: [],
        externalEndpoints: [],
        capabilities: [],
        runtimeAssumptions: [],
        findings: [],
        purposeAlignment: { matches: false, rationale: "All chunks failed." },
        analyzedChunks: 0,
        totalChunks: chunks.length,
        referenceIds: [],
      });
      continue;
    }

    // Single chunk → deterministic adapter (no P2-F needed)
    if (chunks.length === 1 && successfulResults.length === 1) {
      fileEvaluations.push(
        adaptSingleChunkToFileResult(resource, successfulResults[0], chunks[0]),
      );
      continue;
    }

    // Multiple chunks → P2-F synthesis
    const evaluation = await synthesizeFileFromChunks(
      resource,
      chunks,
      successfulResults,
      successfulChunks,
      findingsByResource,
      knownPaths,
      ai,
      signal,
    );
    fileEvaluations.push(evaluation);

    // Mark partial if some chunks failed or synthesis itself returned partial
    if (successfulResults.length < chunks.length || evaluation.status === "partial") {
      hasPartialFailure = true;
    }
  }

  return {
    fileEvaluations,
    hasPartialFailure:
      hasPartialFailure ||
      fileEvaluations.some((evaluation) => evaluation.status !== "complete"),
  };
}

/** Synthesizes a single file from its chunk results (single or batched P2-F). */
async function synthesizeFileFromChunks(
  resource: SkillBundleResource,
  chunks: ResourceChunk[],
  successfulResults: ChunkValidationResult[],
  successfulChunks: ResourceChunk[],
  findingsByResource: Map<string, GroundedSkillFinding[]>,
  knownPaths: string[],
  ai: DeepSkillReviewAiPort,
  signal?: AbortSignal,
): Promise<SkillResourceEvaluation> {
  const path = resource.normalizedPath;
  const chunkResultsPayload = successfulResults.map((result, index) =>
    result.evaluation ?? {
      resourcePath: path,
      chunkId: successfulChunks[index].chunkId,
      status: "partial",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: result.findings,
      purposeAlignment: {
        matches: false,
        rationale: "Only validated findings were retained for this chunk.",
      },
      referenceIds: [],
    },
  );

  const payloadTokens = estimateTokens(chunkResultsPayload);
  const resourceFindings = findingsByResource.get(path) ?? [];
  const metadata = {
    path: resource.normalizedPath,
    kind: resource.kind,
    language: resource.language,
    sizeBytes: resource.sizeBytes,
    sha256: resource.sha256,
    referencedBy: resource.referencedBy,
  };

  if (payloadTokens <= FILE_SYNTHESIS_TOKEN_CEILING) {
    // Single P2-F call — abort check before AI call
    if (signal?.aborted) {
      return makeCancelledEvaluation(path, chunks.length);
    }
    try {
      const payload = buildFileSynthesisPromptInput(metadata, chunkResultsPayload, resourceFindings);
      const sourceCorpus = successfulChunks.map((c) => c.content).join("\n");
      const result = await ai.invokeSkillFileSynthesizer(payload, knownPaths, sourceCorpus);
      const evaluation = result.evaluation;
      return {
        ...evaluation,
        analyzedChunks: successfulResults.length,
        totalChunks: chunks.length,
        status: successfulResults.length < chunks.length ? "partial" : evaluation.status,
      };
    } catch {
      return {
        resourcePath: path,
        status: "partial",
        riskLevel: "none",
        readiness: "unknown",
        observedBehaviors: [],
        dependencies: [],
        externalEndpoints: [],
        capabilities: [],
        runtimeAssumptions: [],
        findings: successfulResults.flatMap((r) => r.findings),
        purposeAlignment: { matches: true, rationale: "Partial — synthesis failed." },
        analyzedChunks: successfulResults.length,
        totalChunks: chunks.length,
        referenceIds: [],
      };
    }
  } else {
    // Batched synthesis: split structured arrays before serialization
    return synthesizeFileBatched(
      path,
      chunks,
      successfulResults,
      successfulChunks,
      chunkResultsPayload,
      resourceFindings,
      metadata,
      knownPaths,
      ai,
      signal,
    );
  }
}

/** Batched P2-F synthesis for files exceeding the token ceiling. */
async function synthesizeFileBatched(
  path: string,
  chunks: ResourceChunk[],
  successfulResults: ChunkValidationResult[],
  successfulChunks: ResourceChunk[],
  chunkResultsPayload: unknown[],
  resourceFindings: GroundedSkillFinding[],
  metadata: { path: string; kind: string; language?: string; sizeBytes: number; sha256: string; referencedBy: string[] },
  knownPaths: string[],
  ai: DeepSkillReviewAiPort,
  signal?: AbortSignal,
): Promise<SkillResourceEvaluation> {
  const batches = splitIntoBatchesByTokens(chunkResultsPayload, FILE_SYNTHESIS_TOKEN_CEILING);
  const batchResults: ResourceValidationResult[] = [];

  const batchOutcomes = await mapWithConcurrency(
    batches,
    AI_CONCURRENCY,
    async (batch) => {
      // Abort check before each batched AI call
      if (signal?.aborted) {
        throw new Error("Aborted");
      }
      const payload = buildFileSynthesisPromptInput(metadata, batch, resourceFindings);
      const sourceCorpus = successfulChunks.map((c) => c.content).join("\n");
      return ai.invokeSkillFileSynthesizer(payload, knownPaths, sourceCorpus);
    },
    signal,
  );

  for (const outcome of batchOutcomes) {
    if (outcome.status === "fulfilled") {
      batchResults.push(outcome.value);
    }
  }

  if (batchResults.length === 0) {
    return {
      resourcePath: path,
      status: "partial",
      riskLevel: "none",
      readiness: "unknown",
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: successfulResults.flatMap((r) => r.findings),
      purposeAlignment: { matches: true, rationale: "Batch synthesis failed." },
      analyzedChunks: successfulResults.length,
      totalChunks: chunks.length,
      referenceIds: [],
    };
  }

  return mergeBatchFileResults(batchResults, path, chunks.length, successfulResults.length);
}
