/**
 * Weighted stage-based progress tracker for skill bundle deep review.
 *
 * Stages have fixed percentage weights. The deep-resource-ai stage is dynamic:
 * the total work-unit count is finalised after chunking, and each completed or
 * failed unit advances the percentage proportionally within that band.
 *
 * Progress never moves backward.
 */
import type { SkillReviewProgress } from "../../contracts/SkillBundle.js";

// ---------------------------------------------------------------------------
// Stage weight constants (spec 013 §9 exact weights, must sum to 100)
// ---------------------------------------------------------------------------

export const STAGE_WEIGHTS = {
  loading: 5,
  downloading: 15,
  "deterministic-scan": 15,
  "standard-ai": 15,
  "deep-resource-ai": 30,
  "file-synthesis": 10,
  "bundle-synthesis": 5,
  persisting: 5,
} as const;

export type ProgressStage = keyof typeof STAGE_WEIGHTS;

// Cumulative start percentages per stage (derived from weights).
const STAGE_ORDER: ProgressStage[] = [
  "loading",
  "downloading",
  "deterministic-scan",
  "standard-ai",
  "deep-resource-ai",
  "file-synthesis",
  "bundle-synthesis",
  "persisting",
];

function computeCumulativeStarts(): Map<ProgressStage, number> {
  const map = new Map<ProgressStage, number>();
  let cumulative = 0;
  for (const stage of STAGE_ORDER) {
    map.set(stage, cumulative);
    cumulative += STAGE_WEIGHTS[stage];
  }
  return map;
}

const CUMULATIVE_STARTS = computeCumulativeStarts();

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SkillReviewProgressTracker {
  /** Mark a non-deep stage as complete. Advances percent to stage end. */
  completeStage(stage: ProgressStage): void;

  /**
   * Initialise the deep-resource-ai stage with the known total work units.
   * Must be called before `completeDeepUnit` / `failDeepUnit`.
   * If totalUnits is 0, the deep stage completes immediately.
   */
  startDeepEvaluation(totalUnits: number): void;

  /** Mark one deep work unit as successfully completed. */
  completeDeepUnit(resourcePath: string): void;

  /** Mark one deep work unit as failed (partial failure). */
  failDeepUnit(resourcePath: string): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProgressTracker(
  skillName: string,
  onProgress: (event: SkillReviewProgress) => void,
): SkillReviewProgressTracker {
  let lastPercent = 0;
  let deepTotalUnits = 0;
  let deepCompletedUnits = 0;
  let deepFailures = 0;

  function emit(
    stage: SkillReviewProgress["stage"],
    resourcePath?: string,
  ): void {
    onProgress({
      stage,
      percent: lastPercent,
      message: resourcePath
        ? `Evaluating ${resourcePath}`
        : `${stage} complete`,
      skillName,
      resourcePath,
      completedUnits: deepCompletedUnits,
      totalUnits: deepTotalUnits,
      partialFailures: deepFailures,
    });
  }

  function advanceTo(percent: number): void {
    // Never allow backward movement.
    if (percent > lastPercent) {
      lastPercent = percent;
    }
  }

  return {
    completeStage(stage: ProgressStage): void {
      const stageStart = CUMULATIVE_STARTS.get(stage) ?? 0;
      const stageEnd = stageStart + STAGE_WEIGHTS[stage];
      advanceTo(stageEnd);
      emit(stage === "persisting" ? "complete" : stage);
    },

    startDeepEvaluation(totalUnits: number): void {
      deepTotalUnits = totalUnits;
      deepCompletedUnits = 0;
      deepFailures = 0;

      if (totalUnits === 0) {
        // Zero work — complete instantly.
        const stageEnd =
          (CUMULATIVE_STARTS.get("deep-resource-ai") ?? 0) +
          STAGE_WEIGHTS["deep-resource-ai"];
        advanceTo(stageEnd);
        emit("deep-resource-ai");
      } else {
        // Emit starting event at the stage's base percent.
        const stageStart = CUMULATIVE_STARTS.get("deep-resource-ai") ?? 0;
        advanceTo(stageStart);
        emit("deep-resource-ai");
      }
    },

    completeDeepUnit(resourcePath: string): void {
      deepCompletedUnits += 1;
      const stageStart = CUMULATIVE_STARTS.get("deep-resource-ai") ?? 0;
      const weight = STAGE_WEIGHTS["deep-resource-ai"];
      const fraction =
        deepTotalUnits > 0 ? deepCompletedUnits / deepTotalUnits : 1;
      advanceTo(stageStart + Math.round(weight * fraction));
      emit("deep-resource-ai", resourcePath);
    },

    failDeepUnit(resourcePath: string): void {
      deepCompletedUnits += 1;
      deepFailures += 1;
      const stageStart = CUMULATIVE_STARTS.get("deep-resource-ai") ?? 0;
      const weight = STAGE_WEIGHTS["deep-resource-ai"];
      const fraction =
        deepTotalUnits > 0 ? deepCompletedUnits / deepTotalUnits : 1;
      advanceTo(stageStart + Math.round(weight * fraction));
      emit("deep-resource-ai", resourcePath);
    },
  };
}
