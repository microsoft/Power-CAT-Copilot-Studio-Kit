/**
 * Deep review Phase 1 (P2-R): resource chunk evaluation (spec 013 §9).
 *
 * Chunks all eligible resources, runs bounded AI evaluation (concurrency 4),
 * and groups results by resource for the file-synthesis phase.
 */
import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type {
  SkillBundle,
  SkillBundleResource,
  ResourceChunk,
} from "../../contracts/SkillBundle.js";
import type { StandardSkillBundleEvaluation } from "../../contracts/SkillEvaluation.js";
import type { ResourcePromptPayload } from "./SkillPromptPayloadBuilder.js";
import type { ChunkValidationResult } from "./SkillEvaluationValidator.js";
import type { BoundedMapResult } from "./concurrency.js";
import type { DeepSkillReviewAiPort } from "./deepReviewHelpers.js";
import type { SkillReviewProgressTracker } from "./progressTracker.js";
import { buildResourcePromptInput } from "./SkillPromptPayloadBuilder.js";
import { chunkResource } from "./chunking.js";
import { mapWithConcurrency } from "./concurrency.js";
import { AI_CONCURRENCY } from "./deepReviewHelpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkWorkItem {
  resource: SkillBundleResource;
  chunk: ResourceChunk;
  resourceIndex: number;
}

export interface ResourceChunkResults {
  resource: SkillBundleResource;
  chunks: ResourceChunk[];
  chunkResults: Array<BoundedMapResult<ChunkValidationResult>>;
}

export interface ChunkEvaluationResult {
  /** Ordered chunk results grouped by resource path. */
  chunkResultsByResource: Map<string, ResourceChunkResults>;
  /** Total number of chunks across all resources. */
  totalChunkCount: number;
}

// ---------------------------------------------------------------------------
// Phase 1: Chunk and evaluate
// ---------------------------------------------------------------------------

/**
 * Chunks eligible resources and evaluates each chunk with bounded concurrency.
 *
 * @param eligibleResources - Resources that passed eligibility checks.
 * @param bundle - The full skill bundle (for context).
 * @param standard - Completed standard evaluation.
 * @param findingsByResource - Pre-computed deterministic findings per resource.
 * @param ai - AI port for chunk evaluation.
 * @param tracker - Progress tracker for work-unit updates.
 * @param signal - Optional abort signal.
 * @returns Grouped chunk results or null if aborted during chunking.
 */
export async function executeChunkEvaluation(
  eligibleResources: SkillBundleResource[],
  bundle: SkillBundle,
  standard: StandardSkillBundleEvaluation,
  findingsByResource: Map<string, GroundedSkillFinding[]>,
  ai: DeepSkillReviewAiPort,
  tracker: SkillReviewProgressTracker,
  signal?: AbortSignal,
): Promise<ChunkEvaluationResult | null> {
  // Chunk all eligible resources
  const resourceChunksMap = new Map<string, { resource: SkillBundleResource; chunks: ResourceChunk[] }>();
  let totalChunkCount = 0;

  for (const resource of eligibleResources) {
    const chunks = await chunkResource(resource);
    resourceChunksMap.set(resource.normalizedPath, { resource, chunks });
    totalChunkCount += chunks.length;
  }

  // Finalize deep work-unit count and start progress
  tracker.startDeepEvaluation(totalChunkCount);

  if (signal?.aborted) {
    return null;
  }

  // Build work items for all chunks
  const workItems: ChunkWorkItem[] = [];
  let resourceIndex = 0;
  for (const [, { resource, chunks }] of resourceChunksMap) {
    for (const chunk of chunks) {
      workItems.push({ resource, chunk, resourceIndex });
    }
    resourceIndex++;
  }

  // Context for prompt building
  const skillContext = {
    skillName: bundle.skillName,
    description: bundle.parentDescription,
    agentInstructions: bundle.agentInstructions,
    declaredPurpose: standard.summary,
  };

  // P2-R: evaluate chunks with concurrency 4
  const chunkResults = await mapWithConcurrency(
    workItems,
    AI_CONCURRENCY,
    async (item) => {
      // Abort check before each AI call
      if (signal?.aborted) {
        throw new Error("Aborted");
      }

      // findingsByResource is already keyed by normalizedPath — no secondary filter needed.
      const resourceFindings = findingsByResource.get(item.resource.normalizedPath) ?? [];
      const payload: ResourcePromptPayload = buildResourcePromptInput({
        skillContext,
        resourceMetadata: {
          path: item.resource.normalizedPath,
          kind: item.resource.kind,
          language: item.resource.language,
          sizeBytes: item.resource.sizeBytes,
          sha256: item.resource.sha256,
          referencedBy: item.resource.referencedBy,
        },
        chunk: item.chunk,
        deterministicFindings: resourceFindings,
      });
      try {
        const result = await ai.invokeSkillResourceChunkEvaluator(payload, item.chunk);
        tracker.completeDeepUnit(item.resource.normalizedPath);
        return result;
      } catch (err) {
        tracker.failDeepUnit(item.resource.normalizedPath);
        throw err;
      }
    },
    signal,
  );

  // Group chunk results by resource
  const chunkResultsByResource = new Map<string, ResourceChunkResults>();
  let workItemIdx = 0;
  for (const [path, { resource, chunks }] of resourceChunksMap) {
    const results: BoundedMapResult<ChunkValidationResult>[] = [];
    for (let i = 0; i < chunks.length; i++) {
      results.push(chunkResults[workItemIdx]);
      workItemIdx++;
    }
    chunkResultsByResource.set(path, { resource, chunks, chunkResults: results });
  }

  return { chunkResultsByResource, totalChunkCount };
}
