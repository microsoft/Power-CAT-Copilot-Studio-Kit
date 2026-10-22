import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type {
  SkillBundle,
  SkillBundleResource,
  ResourceChunk,
} from "../../contracts/SkillBundle.js";
import type {
  ResourceChunkEvaluation,
  SkillResourceEvaluation,
} from "../../contracts/SkillEvaluation.js";
import type {
  ResourcePromptPayload,
  FileSynthesisPromptPayload,
  BundleSynthesisPromptPayload,
} from "./SkillPromptPayloadBuilder.js";
import type { ChunkValidationResult, ResourceValidationResult, DeepBundleValidationResult } from "./SkillEvaluationValidator.js";
import { scanSkillResource } from "./resourceScanners.js";
import { estimateTokens } from "./tokenBudget.js";

// Constants

export const AI_CONCURRENCY = 4;

// AI port interface (defined here to avoid circular imports)

/** Injectable AI port for deep review phases (P2-R, P2-F, P2-B). */
export interface DeepSkillReviewAiPort {
  invokeSkillResourceChunkEvaluator(
    payload: ResourcePromptPayload,
    chunk: ResourceChunk,
  ): Promise<ChunkValidationResult>;

  invokeSkillFileSynthesizer(
    payload: FileSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ): Promise<ResourceValidationResult>;

  invokeDeepSkillBundleSynthesizer(
    payload: BundleSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ): Promise<DeepBundleValidationResult>;
}

// Source corpus builder (shared between Standard and Deep)

/**
 * Builds the combined source corpus from a skill bundle.
 * Used as grounding context for AI calls in both Standard and Deep modes.
 */
export function buildBundleSourceCorpus(bundle: SkillBundle): string {
  const parts: string[] = [bundle.skillMarkdown];
  for (const resource of bundle.resources) {
    if (resource.textContent && !resource.isBinary) {
      parts.push(resource.textContent);
    }
  }
  return parts.join("\n");
}

// Resource eligibility

/** Returns true when a resource should be sent to deep AI evaluation. */
export function isEligibleForDeep(
  resource: SkillBundleResource,
  highRiskPaths: Set<string>,
): boolean {
  // Binary / failed-decode / no text content → skip
  if (resource.isBinary || resource.decodeStatus === "failed" || !resource.textContent) {
    return false;
  }
  // High/critical redacted → skip
  if (highRiskPaths.has(resource.normalizedPath.toLowerCase())) {
    return false;
  }
  return true;
}

// Deterministic resource findings (computed once, reused everywhere)

/**
 * Computes deterministic findings for all resources and returns both:
 * - a per-resource map for P2-R inputs
 * - a set of high-risk paths for eligibility exclusion
 *
 * This avoids scanning each resource twice.
 */
export function computeResourceFindings(
  bundle: SkillBundle,
): {
  highRiskPaths: Set<string>;
  findingsByResource: Map<string, GroundedSkillFinding[]>;
  allFindings: GroundedSkillFinding[];
} {
  const findingsByResource = new Map<string, GroundedSkillFinding[]>();
  const highRiskPaths = new Set<string>();
  const allFindings: GroundedSkillFinding[] = [];

  for (const resource of bundle.resources) {
    const findings = scanSkillResource(resource);
    findingsByResource.set(resource.normalizedPath, findings);
    allFindings.push(...findings);

    // Gate on the canonical normalizedPath so that originalPath variants
    // (leading "./", backslashes, percent-encoding) cannot bypass exclusion.
    const hasHighCritical = findings.some(
      (f) => f.severity === "high" || f.severity === "critical",
    );
    if (hasHighCritical) {
      highRiskPaths.add(resource.normalizedPath.toLowerCase());
    }
  }

  return { highRiskPaths, findingsByResource, allFindings };
}

// Token-aware batching

/**
 * Splits an array into batches such that each batch's estimated tokens
 * stays within the given ceiling. Never slices serialized JSON.
 */
export function splitIntoBatchesByTokens<T>(
  items: T[],
  ceiling: number,
): T[][] {
  const batches: T[][] = [];
  let currentBatch: T[] = [];
  let currentTokens = 0;

  for (const item of items) {
    const itemTokens = estimateTokens(item);
    if (currentBatch.length > 0 && currentTokens + itemTokens > ceiling) {
      batches.push(currentBatch);
      currentBatch = [item];
      currentTokens = itemTokens;
    } else {
      currentBatch.push(item);
      currentTokens += itemTokens;
    }
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  return batches;
}

// Single-chunk adapter

/**
 * Builds a deterministic file-level evaluation from a single chunk result,
 * without invoking P2-F (synthesis not needed for single chunks).
 */
export function adaptSingleChunkToFileResult(
  resource: SkillBundleResource,
  chunkResult: ChunkValidationResult,
  chunk: ResourceChunk,
): SkillResourceEvaluation {
  const eval_: ResourceChunkEvaluation = chunkResult.evaluation ?? {
    resourcePath: resource.normalizedPath,
    chunkId: chunk.chunkId,
    status: "complete",
    observedBehaviors: [],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [],
    runtimeAssumptions: [],
    findings: chunkResult.findings,
    purposeAlignment: { matches: true, rationale: "Single chunk — direct adaptation." },
    referenceIds: [],
  };

  return {
    resourcePath: resource.normalizedPath,
    status: eval_.status,
    riskLevel: "none",
    readiness: "ready",
    observedBehaviors: eval_.observedBehaviors,
    dependencies: eval_.dependencies,
    externalEndpoints: eval_.externalEndpoints,
    capabilities: eval_.capabilities,
    runtimeAssumptions: eval_.runtimeAssumptions,
    findings: eval_.findings,
    purposeAlignment: eval_.purposeAlignment,
    analyzedChunks: 1,
    totalChunks: 1,
    referenceIds: eval_.referenceIds,
  };
}

// Batch file-result merge

/**
 * Merges batch P2-F synthesis results into a single file-level evaluation.
 * Deduplicates findings by id.
 */
export function mergeBatchFileResults(
  batchResults: ResourceValidationResult[],
  resourcePath: string,
  totalChunks: number,
  analyzedChunks: number,
): SkillResourceEvaluation {
  const findings: GroundedSkillFinding[] = [];
  const observedBehaviors: SkillResourceEvaluation["observedBehaviors"] = [];
  const dependencies: SkillResourceEvaluation["dependencies"] = [];
  const externalEndpoints: SkillResourceEvaluation["externalEndpoints"] = [];
  const capabilities: SkillResourceEvaluation["capabilities"] = [];
  const runtimeAssumptions: SkillResourceEvaluation["runtimeAssumptions"] = [];
  const referenceIds: string[] = [];

  for (const result of batchResults) {
    const ev = result.evaluation;
    findings.push(...ev.findings);
    observedBehaviors.push(...ev.observedBehaviors);
    dependencies.push(...ev.dependencies);
    externalEndpoints.push(...ev.externalEndpoints);
    capabilities.push(...ev.capabilities);
    runtimeAssumptions.push(...ev.runtimeAssumptions);
    referenceIds.push(...ev.referenceIds);
  }

  // Deduplicate findings by id
  const seenIds = new Set<string>();
  const deduped = findings.filter((f) => {
    if (seenIds.has(f.id)) return false;
    seenIds.add(f.id);
    return true;
  });

  return {
    resourcePath,
    status:
      analyzedChunks < totalChunks ||
      batchResults.some((result) => result.evaluation.status !== "complete")
        ? "partial"
        : "complete",
    riskLevel: "none",
    readiness: "ready",
    observedBehaviors,
    dependencies,
    externalEndpoints,
    capabilities,
    runtimeAssumptions,
    findings: deduped,
    purposeAlignment: batchResults[0]?.evaluation.purposeAlignment ?? {
      matches: true,
      rationale: "Merged from batch synthesis.",
    },
    analyzedChunks,
    totalChunks,
    referenceIds: [...new Set(referenceIds)],
  };
}

// Skipped resource evaluation helper

/** Creates a skipped resource evaluation for ineligible resources. */
export function makeSkippedEvaluation(
  resource: SkillBundleResource,
): SkillResourceEvaluation {
  return {
    resourcePath: resource.normalizedPath,
    status: "skipped",
    riskLevel: "none",
    readiness: "unknown",
    observedBehaviors: [],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [],
    runtimeAssumptions: [],
    findings: [],
    purposeAlignment: { matches: false, rationale: "Skipped (binary, failed decode, or redacted)." },
    analyzedChunks: 0,
    totalChunks: 0,
    referenceIds: [],
  };
}

/** Creates a cancelled resource evaluation. */
export function makeCancelledEvaluation(
  resourcePath: string,
  totalChunks: number,
): SkillResourceEvaluation {
  return {
    resourcePath,
    status: "cancelled",
    riskLevel: "none",
    readiness: "unknown",
    observedBehaviors: [],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [],
    runtimeAssumptions: [],
    findings: [],
    purposeAlignment: { matches: false, rationale: "Cancelled." },
    analyzedChunks: 0,
    totalChunks,
    referenceIds: [],
  };
}
