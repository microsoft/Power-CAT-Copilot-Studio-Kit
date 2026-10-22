/**
 * Deep review Phase 3 (P2-B): bundle synthesis (spec 013 §9).
 *
 * Synthesizes per-file evaluations into a single bundle-level deep result.
 * Handles token-aware batching with bounded map/reduce for oversized payloads.
 */
import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type { SkillBundle } from "../../contracts/SkillBundle.js";
import type {
  StandardSkillBundleEvaluation,
  SkillResourceEvaluation,
  DeepSkillBundleEvaluation,
} from "../../contracts/SkillEvaluation.js";
import type { DeepBundleValidationResult } from "./SkillEvaluationValidator.js";
import type { DeepSkillReviewAiPort } from "./deepReviewHelpers.js";
import { buildBundleSynthesisPromptInput } from "./SkillPromptPayloadBuilder.js";
import { analyzeBundleIntegrity } from "./bundleIntegrity.js";
import { mapWithConcurrency } from "./concurrency.js";
import {
  estimateTokens,
  BUNDLE_SYNTHESIS_TOKEN_CEILING,
} from "./tokenBudget.js";
import {
  AI_CONCURRENCY,
  splitIntoBatchesByTokens,
  buildBundleSourceCorpus,
} from "./deepReviewHelpers.js";

// ---------------------------------------------------------------------------
// Phase 3: P2-B bundle synthesis
// ---------------------------------------------------------------------------

/**
 * Synthesizes file evaluations into a bundle-level deep result.
 *
 * @param fileEvaluations - All file-level evaluations (including skipped).
 * @param hasPartialFailure - Whether any resource had partial failures.
 * @param bundle - The full skill bundle.
 * @param standard - Standard evaluation for context.
 * @param allFindings - All deterministic findings across the bundle.
 * @param ai - AI port for bundle synthesis.
 * @param signal - Optional abort signal.
 */
export async function executeBundleSynthesis(
  fileEvaluations: SkillResourceEvaluation[],
  hasPartialFailure: boolean,
  bundle: SkillBundle,
  standard: StandardSkillBundleEvaluation,
  allFindings: GroundedSkillFinding[],
  ai: DeepSkillReviewAiPort,
  signal?: AbortSignal,
): Promise<DeepSkillBundleEvaluation> {
  if (signal?.aborted) {
    return {
      status: "cancelled",
      synthesisLevel: "final",
      resources: fileEvaluations,
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Review was cancelled before bundle synthesis.",
      referenceIds: [],
    };
  }

  const bundleIntegrity = analyzeBundleIntegrity(bundle);
  const knownPaths = bundle.resources.map((r) => r.normalizedPath);
  const resourceResultsPayload = fileEvaluations.filter(
    (r) => r.status !== "skipped" && r.status !== "cancelled",
  );

  const resourceTokens = estimateTokens(resourceResultsPayload);

  // Instruction-only skills carry nothing for the synthesizer to correlate.
  // Calling the prompt with an empty payload burns a Copilot Credit for a
  // guaranteed-empty answer, so return the resolved shape directly.
  if (resourceResultsPayload.length === 0) {
    return {
      status: hasPartialFailure ? "partial" : "complete",
      synthesisLevel: "final",
      resources: fileEvaluations,
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "The skill has no supporting resources to analyse; the review covers its instructions only.",
      referenceIds: [],
    };
  }

  try {
    if (resourceTokens <= BUNDLE_SYNTHESIS_TOKEN_CEILING) {
      return await synthesizeBundleSingle(
        fileEvaluations,
        hasPartialFailure,
        resourceResultsPayload,
        bundle,
        standard,
        bundleIntegrity,
        allFindings,
        knownPaths,
        ai,
        signal,
      );
    } else {
      return await synthesizeBundleBatched(
        fileEvaluations,
        hasPartialFailure,
        resourceResultsPayload,
        bundle,
        standard,
        bundleIntegrity,
        allFindings,
        knownPaths,
        ai,
        signal,
      );
    }
  } catch {
    return {
      status: "partial",
      synthesisLevel: "partial",
      resources: fileEvaluations,
      crossFileChains: [],
      findings: fileEvaluations.flatMap((r) => r.findings),
      operationalAssumptions: [],
      summary: "Bundle synthesis failed — file-level results preserved.",
      referenceIds: [],
    };
  }
}

/** Single P2-B call when resource payload fits within the token ceiling. */
async function synthesizeBundleSingle(
  fileEvaluations: SkillResourceEvaluation[],
  hasPartialFailure: boolean,
  resourceResultsPayload: SkillResourceEvaluation[],
  bundle: SkillBundle,
  standard: StandardSkillBundleEvaluation,
  bundleIntegrity: unknown,
  allFindings: GroundedSkillFinding[],
  knownPaths: string[],
  ai: DeepSkillReviewAiPort,
  signal?: AbortSignal,
): Promise<DeepSkillBundleEvaluation> {
  // Abort check before single P2-B AI call
  if (signal?.aborted) {
    return {
      status: "cancelled",
      synthesisLevel: "final",
      resources: fileEvaluations,
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Review was cancelled before bundle synthesis.",
      referenceIds: [],
    };
  }

  const payload = buildBundleSynthesisPromptInput(
    bundle,
    resourceResultsPayload,
    bundleIntegrity,
    allFindings,
    "final",
    standard,
  );
  const sourceCorpus = buildBundleSourceCorpus(bundle);
  const result = await ai.invokeDeepSkillBundleSynthesizer(payload, knownPaths, sourceCorpus);
  return {
    ...result.evaluation,
    resources: fileEvaluations,
    status: hasPartialFailure ? "partial" : result.evaluation.status,
  };
}

/** Bounded partial map/reduce P2-B synthesis for oversized payloads. */
async function synthesizeBundleBatched(
  fileEvaluations: SkillResourceEvaluation[],
  hasPartialFailure: boolean,
  resourceResultsPayload: SkillResourceEvaluation[],
  bundle: SkillBundle,
  standard: StandardSkillBundleEvaluation,
  bundleIntegrity: unknown,
  allFindings: GroundedSkillFinding[],
  knownPaths: string[],
  ai: DeepSkillReviewAiPort,
  signal?: AbortSignal,
): Promise<DeepSkillBundleEvaluation> {
  const resourceBatches = splitIntoBatchesByTokens(resourceResultsPayload, BUNDLE_SYNTHESIS_TOKEN_CEILING);
  const partialResults: DeepBundleValidationResult[] = [];

  const partialOutcomes = await mapWithConcurrency(
    resourceBatches,
    AI_CONCURRENCY,
    async (batch) => {
      // Abort check before each partial P2-B AI call
      if (signal?.aborted) {
        throw new Error("Aborted");
      }
      const payload = buildBundleSynthesisPromptInput(
        bundle,
        batch,
        bundleIntegrity,
        allFindings,
        "partial",
        standard,
      );
      const sourceCorpus = buildBundleSourceCorpus(bundle);
      return ai.invokeDeepSkillBundleSynthesizer(payload, knownPaths, sourceCorpus);
    },
    signal,
  );

  for (const outcome of partialOutcomes) {
    if (outcome.status === "fulfilled") {
      partialResults.push(outcome.value);
    }
  }

  if (partialResults.length === 0) {
    return {
      status: "partial",
      synthesisLevel: "partial",
      resources: fileEvaluations,
      crossFileChains: [],
      findings: allFindings.filter(
        (f) => f.severity === "high" || f.severity === "critical",
      ),
      operationalAssumptions: [],
      summary: "Bundle synthesis failed — partial results only.",
      referenceIds: [],
    };
  }

  // Final synthesis pass from partial results — abort check before final AI call
  if (signal?.aborted) {
    return {
      status: "cancelled",
      synthesisLevel: "partial",
      resources: fileEvaluations,
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: "Review was cancelled before final bundle synthesis.",
      referenceIds: [],
    };
  }

  const partialPayload = partialResults.map((r) => r.evaluation);
  const finalPayload = buildBundleSynthesisPromptInput(
    bundle,
    partialPayload,
    bundleIntegrity,
    allFindings,
    "final",
    standard,
  );
  const sourceCorpus = buildBundleSourceCorpus(bundle);
  const finalResult = await ai.invokeDeepSkillBundleSynthesizer(finalPayload, knownPaths, sourceCorpus);
  return {
    ...finalResult.evaluation,
    resources: fileEvaluations,
    status: hasPartialFailure ? "partial" : finalResult.evaluation.status,
  };
}
