/** Deep-mode Standard-then-Deep delegation for the skill bundle review pipeline (Task 9 decomposition). */
import type { SkillBundle, SkillReviewProgress, SkillBundleReviewResult } from '../../contracts/SkillBundle.js';
import type { StandardSkillBundleEvaluation, DeepSkillBundleEvaluation } from '../../contracts/SkillEvaluation.js';
import { executeDeepSkillReview } from './DeepSkillReviewOrchestrator.js';
import type { DeepSkillReviewAiPort } from './deepReviewHelpers.js';
// Re-export so SkillBundleReviewService can obtain the type via deepFacade without importing from the orchestrator.
export type { DeepSkillReviewAiPort };

/**
 * Opaque callback that runs a Standard-mode review.
 * Injected by SkillBundleReviewService to avoid a circular import back into the facade layer.
 */
export type StandardReviewRunner = (
  onProgress?: (p: SkillReviewProgress) => void,
  signal?: AbortSignal,
) => Promise<SkillBundleReviewResult>;

/**
 * Runs the Standard phase first then delegates to the deep orchestrator.
 * Applies monotonic progress scaling: Standard maps to 0–50%, Deep to ≥50%.
 *
 * @param bundle - Assembled skill bundle.
 * @param skillName - Display name for progress events and the result header.
 * @param skillSchemaName - Schema name for the result header.
 * @param deepAi - Pre-validated deep AI port (all three methods non-null).
 * @param runStandard - Callback that executes the Standard phase.
 * @param onProgress - Optional progress subscriber.
 * @param signal - Optional cancellation signal.
 */
export async function executeDeepSkillBundleReview(
  bundle: SkillBundle,
  skillName: string,
  skillSchemaName: string,
  deepAi: DeepSkillReviewAiPort,
  runStandard: StandardReviewRunner,
  onProgress?: (p: SkillReviewProgress) => void,
  signal?: AbortSignal,
): Promise<SkillBundleReviewResult> {
  // Shared closure: tracks the highest percent seen across Standard and Deep phases.
  let lastMonotonicPercent = 0;

  // Scale Standard's 0-100% into the 0-50% band; never allow backward movement.
  const standardProgressAdapter: ((p: SkillReviewProgress) => void) | undefined =
    onProgress
      ? (p) => {
          const remapped = Math.round(p.percent * 0.5);
          if (remapped > lastMonotonicPercent) {
            lastMonotonicPercent = remapped;
          }
          onProgress({ ...p, percent: lastMonotonicPercent });
        }
      : undefined;

  const standardResult = await runStandard(standardProgressAdapter, signal);

  if (
    standardResult.status === 'cancelled'
    || standardResult.status === 'blocked'
    || standardResult.aiEvaluationSkipped
  ) {
    return { ...standardResult, mode: 'deep' };
  }

  // Even when Standard is unavailable or partial, continue with deterministic findings.
  const standardEvaluation: StandardSkillBundleEvaluation =
    standardResult.standardEvaluation ?? {
      status: 'partial' as const,
      dimensions: [],
      findings: [],
      resourcePurposeAlignment: [],
      operationalAssumptions: [],
      unreviewedResources: [],
      summary: '',
      referenceIds: [],
    };

  // The workflow backend analyses every resource in the same agent call that
  // produced the standard evaluation, so `resources` is already populated. The
  // chunk-then-synthesise cascade below has nothing left to compute, so skip it
  // and spend no further model calls. The AI Builder backend leaves `resources`
  // undefined -- a prompt has no loop and a small window -- so it falls through.
  if (standardEvaluation.resources?.length) {
    onProgress?.({
      stage: 'deep-resource-ai',
      percent: 100,
      message: `Analysed ${standardEvaluation.resources.length} resource(s)`,
      skillName,
      completedUnits: standardEvaluation.resources.length,
      totalUnits: standardEvaluation.resources.length,
      partialFailures: 0,
    });

    return {
      status: standardResult.status === 'complete' ? 'complete' : 'partial',
      mode: 'deep',
      skillName,
      skillSchemaName,
      deterministicFindings: standardResult.deterministicFindings,
      standardEvaluation,
      deepEvaluation: deepEvaluationFromStandard(standardEvaluation),
      validationIssues: standardResult.validationIssues,
      blocked: standardResult.blocked,
    };
  }

  // Deep progress: enforce monotonicity ≥ whatever Standard reached.
  const deepProgressAdapter: (p: SkillReviewProgress) => void = onProgress
    ? (p) => {
        if (p.percent > lastMonotonicPercent) {
          lastMonotonicPercent = p.percent;
        }
        onProgress({ ...p, percent: lastMonotonicPercent });
      }
    : () => {};

  const deepResult: DeepSkillBundleEvaluation = await executeDeepSkillReview(
    bundle,
    standardEvaluation,
    { ai: deepAi, deepProvisioned: true },
    deepProgressAdapter,
    signal,
  );

  return {
    status:
      deepResult.status === 'complete'
        ? 'complete'
        : deepResult.status === 'cancelled'
          ? 'cancelled'
          : 'partial',
    mode: 'deep',
    skillName,
    skillSchemaName,
    deterministicFindings: standardResult.deterministicFindings,
    standardEvaluation,
    deepEvaluation: deepResult,
    validationIssues: standardResult.validationIssues,
    blocked: false,
    aiEvaluationSkipped: false,
  };
}

/**
 * Build the deep evaluation from a standard result that already carries
 * per-resource analysis.
 *
 * Nothing here calls a model: the workflow agent produced every resource
 * evaluation in one call, so this only reshapes them into the deep contract the
 * renderer and the persisted review expect.
 */
export function deepEvaluationFromStandard(
  standard: StandardSkillBundleEvaluation,
): DeepSkillBundleEvaluation {
  const resources = standard.resources ?? [];
  return {
    status: standard.status === 'complete' ? 'complete' : 'partial',
    synthesisLevel: 'final',
    resources,
    crossFileChains: [],
    findings: resources.flatMap((r) => r.findings),
    operationalAssumptions: standard.operationalAssumptions.map((a) => ({
      statement: a.statement,
      resourcePaths: a.resourcePath ? [a.resourcePath] : [],
    })),
    summary: standard.summary,
    referenceIds: [...new Set(resources.flatMap((r) => r.referenceIds))],
  };
}
