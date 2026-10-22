/**
 * Deep skill review orchestration (spec 013 §9, Task 9).
 *
 * Orchestrates the three-phase deep evaluation pipeline:
 *   Phase 1 (P2-R): Chunk every safe text resource -> evaluate each chunk.
 *   Phase 2 (P2-F): Synthesize chunk results into per-file evaluations.
 *   Phase 3 (P2-B): Synthesize file evaluations into a bundle-level result.
 *
 * Constraints:
 * - AI concurrency is exactly 4.
 * - Never sends binary, failed-decode, high/critical-redacted, base64, SAS URLs.
 * - Deep prompt unavailability is explicit; never invokes zero GUIDs.
 * - Never uses unbounded Promise.all for AI calls.
 * - Cancellation stops scheduling; unstarted work is cancelled.
 * - Late results after abort do not schedule further work.
 *
 * Phase logic is delegated to focused modules:
 * - deepReviewHelpers.ts: shared utilities (eligibility, batching, adapters)
 * - deepResourceEvaluation.ts: P2-R chunk evaluation
 * - deepSynthesis.ts: P2-F file synthesis + P2-B bundle synthesis
 */
import type {
  SkillBundle,
  SkillBundleResource,
  SkillReviewProgress,
} from "../../contracts/SkillBundle.js";
import type {
  StandardSkillBundleEvaluation,
  SkillResourceEvaluation,
  DeepSkillBundleEvaluation,
} from "../../contracts/SkillEvaluation.js";
import { createProgressTracker } from "./progressTracker.js";
import {
  isEligibleForDeep,
  computeResourceFindings,
  makeSkippedEvaluation,
  type DeepSkillReviewAiPort,
} from "./deepReviewHelpers.js";
import { executeChunkEvaluation } from "./deepResourceEvaluation.js";
import { executeFileSynthesis } from "./deepSynthesis.js";
import { executeBundleSynthesis } from "./deepBundleSynthesis.js";

// Re-export the AI port so existing consumers don't need to change import paths.
export type { DeepSkillReviewAiPort } from "./deepReviewHelpers.js";

// ---------------------------------------------------------------------------
// Public dependency interface
// ---------------------------------------------------------------------------

export interface DeepSkillReviewDependencies {
  ai: DeepSkillReviewAiPort;
  /** When false, the deep AI prompts are not invoked (zero GUIDs). */
  deepProvisioned?: boolean;
}

// ---------------------------------------------------------------------------
// Main orchestration entry point
// ---------------------------------------------------------------------------

/**
 * Execute the deep skill review pipeline.
 *
 * @param bundle - Assembled skill bundle with resources.
 * @param standard - Completed standard evaluation (prerequisite).
 * @param deps - Injected AI and provisioning dependencies.
 * @param onProgress - Progress callback.
 * @param signal - Optional AbortSignal to cancel the review.
 * @returns Deep evaluation result with per-resource breakdowns.
 */
export async function executeDeepSkillReview(
  bundle: SkillBundle,
  standard: StandardSkillBundleEvaluation,
  deps: DeepSkillReviewDependencies,
  onProgress: (event: SkillReviewProgress) => void,
  signal?: AbortSignal,
): Promise<DeepSkillBundleEvaluation> {
  // Guard: already aborted
  if (signal?.aborted) {
    return {
      status: "cancelled",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Review was cancelled before deep evaluation started.",
      referenceIds: [],
    };
  }

  // Guard: deep prompts not provisioned (zero GUIDs).
  if (deps.deepProvisioned === false) {
    return {
      status: "failed",
      synthesisLevel: "final",
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Deep review prompts are not provisioned.",
      referenceIds: [],
      parseError: "DEEP_UNAVAILABLE",
    };
  }

  const tracker = createProgressTracker(bundle.skillName, onProgress);

  // Compute deterministic resource findings ONCE and reuse for both
  // high-risk exclusion and P2-R inputs (fix #3: avoid scanning twice).
  const { highRiskPaths, findingsByResource, allFindings } = computeResourceFindings(bundle);

  // Partition resources into eligible and skipped
  const eligibleResources: SkillBundleResource[] = [];
  const skippedEvaluations: SkillResourceEvaluation[] = [];

  for (const resource of bundle.resources) {
    if (isEligibleForDeep(resource, highRiskPaths)) {
      eligibleResources.push(resource);
    } else {
      skippedEvaluations.push(makeSkippedEvaluation(resource));
    }
  }

  // Phase 1: P2-R - Chunk and evaluate
  const chunkResult = await executeChunkEvaluation(
    eligibleResources,
    bundle,
    standard,
    findingsByResource,
    deps.ai,
    tracker,
    signal,
  );

  if (!chunkResult) {
    // Aborted during chunking
    return {
      status: "cancelled",
      synthesisLevel: "final",
      resources: [...skippedEvaluations],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Review was cancelled during chunking.",
      referenceIds: [],
    };
  }

  // Phase 2: P2-F - File synthesis
  const { fileEvaluations, hasPartialFailure } = await executeFileSynthesis(
    chunkResult.chunkResultsByResource,
    skippedEvaluations,
    findingsByResource,
    bundle,
    deps.ai,
    signal,
  );

  // File synthesis phase complete
  tracker.completeStage("file-synthesis");

  // Phase 3: P2-B - Bundle synthesis
  const deepResult = await executeBundleSynthesis(
    fileEvaluations,
    hasPartialFailure,
    bundle,
    standard,
    allFindings,
    deps.ai,
    signal,
  );

  // Bundle synthesis phase complete
  tracker.completeStage("bundle-synthesis");

  return deepResult;
}
