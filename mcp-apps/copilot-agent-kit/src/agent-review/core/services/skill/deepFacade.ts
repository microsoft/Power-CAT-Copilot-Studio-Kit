import type { StandardSkillBundleEvaluation, DeepSkillBundleEvaluation } from '../../contracts/SkillEvaluation.js';

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
