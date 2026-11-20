/**
 * Wires the uploaded-artifact review to the same AI stage the agent reviews use.
 *
 * The judgement itself runs where every other review's judgement runs: a modern
 * workflow with an agent node, reached through `createWorkflowReviewAiPort`.
 * Nothing new is invented here — the artifact is adapted into the `SkillBundle`
 * shape that pipeline already accepts, and the findings it returns are adapted
 * back.
 *
 * This file is the Agent Review Tool's *binding* for that stage, not the stage itself. Everything
 * that decides what a finding means — grounding it against the uploaded bytes, dropping the
 * uncorroborated ones, combining portions into one assessment — lives in `artifactAiStageCore`, so
 * that a second host reviewing the same upload reaches the same verdict by calling the same code
 * rather than a copy of it. What stays here is what only this host can answer: which backend is
 * configured, how the job row is reached, what the artifact is called, and how progress is worded.
 */
import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import {
  createPromptReviewAiPort,
  createWorkflowReviewAiPort,
} from '../../agents-experience/services/ai-providers/ReviewAiProvider';
import {
  logReviewBackend,
  resolveReviewAiProvider,
} from '../../agents-experience/services/ai-providers/reviewAiBackend';
import { describeAiProgress } from '../components/artifactProgressStages';
import { SYNTHETIC_ID_PREFIX } from './uploadBundleAdapter';
import { planReviewPortions } from './reviewPortionPlanner';
import {
  createArtifactAiStageCore,
  type ArtifactAiStageOptions,
  type ArtifactWorkflowBinding,
} from './artifactAiStageCore';

export type { ArtifactAiStageOptions, ArtifactAiStageProgress } from './artifactAiStageCore';

/**
 * True when a large upload may be split into portions reviewed in parallel.
 *
 * Off by default. The split path needs the workflow's `ArtifactBundle` branch to
 * exist and be correctly configured; until that is verified in an environment,
 * an upload must keep taking the single-component path that is known to work.
 *
 * Read per review rather than at module load so the flag can be exercised in
 * tests and changed without a rebuild of the module graph.
 */
function portionsEnabled(): boolean {
  return import.meta.env.VITE_ARTIFACT_REVIEW_PORTIONS === 'true';
}

/**
 * Build the `runAiStage` dependency for `reviewArtifact`.
 *
 * A thrown error here degrades the review to `partial` and keeps every
 * deterministic finding, so an unavailable backend costs the AI dimensions
 * rather than the whole review.
 */
export function createArtifactAiStage(options: ArtifactAiStageOptions = {}) {
  return createArtifactAiStageCore({
    promptPort: createPromptReviewAiPort(),
    // Resolved per review rather than once per stage, because the backend is a setting a user can
    // change between two reviews without reloading the app.
    //
    // Only the workflow backend gains from a split. Its Loop reviews the portions in parallel, which
    // is the whole point; the prompt backend has no such loop, so splitting there would buy N times
    // the calls and none of the time saving.
    planPortions: (bundle: SkillBundle) =>
      resolveReviewAiProvider() === 'workflow' && portionsEnabled()
        ? planReviewPortions(bundle)
        : { portions: [bundle], split: false },
    bindWorkflow: ({ artifact, bundleName, split, portionCount, signal }) => {
      const backend = resolveReviewAiProvider();
      logReviewBackend(backend);
      if (backend !== 'workflow') return null;

      const workflow = createWorkflowReviewAiPort({
        // An upload has no bot record, so a synthetic identifier derived
        // from the artifact hash stands in. It is stable for the same
        // bytes, which keeps a resubmitted file traceable to its job.
        botId: `${SYNTHETIC_ID_PREFIX}${artifact.hash}`,
        // Always the original name, never a portion label. This is what the
        // user sees and what the job row is identified by.
        botName: bundleName,
        sourceEnvironment: '',
        existingJobId: options.existingJobId,
        jobKind: 'ArtifactBundle',
        onProgress: (p) =>
          options.onStageProgress?.({
            message: describeAiProgress(bundleName, p.phase === 'running'),
            // A split archive reports a count, never the workflow's
            // `lastCompleted` ping. That ping names whichever part finished
            // most recently, and parallel iterations overwrite each other,
            // so it reads "4 of 6" then "2 of 6" and looks like the review
            // is going backwards. The count only ever rises.
            ...(split
              ? { completedParts: p.completedComponents, totalParts: portionCount }
              : { lastCompleted: p.lastCompleted }),
          }),
        signal,
      });

      const binding: ArtifactWorkflowBinding = {
        port: workflow.port,
        // Copied rather than passed through: the core treats the portion list as immutable, and
        // `prime` takes a mutable array.
        prime: (portions, deterministicFindings, capabilityModel) =>
          workflow.provider.prime([...portions], deterministicFindings, capabilityModel),
      };
      return binding;
    },
  });
}
