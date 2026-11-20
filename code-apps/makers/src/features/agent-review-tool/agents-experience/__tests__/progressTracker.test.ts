import { describe, expect, it } from "vitest";
import {
  createProgressTracker,
  STAGE_WEIGHTS,
  type SkillReviewProgressTracker,
} from "../services/skill/progressTracker";
import type { SkillReviewProgress } from "../contracts/SkillBundle";

describe("progressTracker", () => {
  it("starts at loading end and ends at 100% when all stages complete", () => {
    const events: SkillReviewProgress[] = [];
    const tracker: SkillReviewProgressTracker = createProgressTracker(
      "test-skill",
      (e) => events.push(e),
    );

    tracker.completeStage("loading");
    tracker.completeStage("downloading");
    tracker.completeStage("deterministic-scan");
    tracker.completeStage("standard-ai");
    tracker.startDeepEvaluation(4);
    tracker.completeDeepUnit("scripts/a.py");
    tracker.completeDeepUnit("scripts/b.py");
    tracker.completeDeepUnit("scripts/c.py");
    tracker.completeDeepUnit("scripts/d.py");
    tracker.completeStage("file-synthesis");
    tracker.completeStage("bundle-synthesis");
    tracker.completeStage("persisting");

    // First event starts at loading stage end (5%)
    expect(events[0].percent).toBe(5);
    expect(events[events.length - 1].percent).toBe(100);
  });

  it("percent never moves backward", () => {
    const events: SkillReviewProgress[] = [];
    const tracker = createProgressTracker("test-skill", (e) => events.push(e));

    tracker.completeStage("loading");
    tracker.completeStage("downloading");
    tracker.completeStage("deterministic-scan");
    tracker.completeStage("standard-ai");
    tracker.startDeepEvaluation(2);
    tracker.completeDeepUnit("scripts/a.py");
    tracker.failDeepUnit("scripts/b.py");
    tracker.completeStage("file-synthesis");
    tracker.completeStage("bundle-synthesis");
    tracker.completeStage("persisting");

    for (let i = 1; i < events.length; i++) {
      expect(events[i].percent).toBeGreaterThanOrEqual(events[i - 1].percent);
    }
  });

  it("reports resourcePath for deep units", () => {
    const events: SkillReviewProgress[] = [];
    const tracker = createProgressTracker("test-skill", (e) => events.push(e));

    tracker.completeStage("loading");
    tracker.completeStage("downloading");
    tracker.completeStage("deterministic-scan");
    tracker.completeStage("standard-ai");
    tracker.startDeepEvaluation(1);
    tracker.completeDeepUnit("scripts/run.py");

    const deepEvent = events.find((e) => e.resourcePath === "scripts/run.py");
    expect(deepEvent).toBeDefined();
    expect(deepEvent!.stage).toBe("deep-resource-ai");
  });

  it("tracks partialFailures count", () => {
    const events: SkillReviewProgress[] = [];
    const tracker = createProgressTracker("test-skill", (e) => events.push(e));

    tracker.completeStage("loading");
    tracker.completeStage("downloading");
    tracker.completeStage("deterministic-scan");
    tracker.completeStage("standard-ai");
    tracker.startDeepEvaluation(3);
    tracker.completeDeepUnit("a.py");
    tracker.failDeepUnit("b.py");
    tracker.completeDeepUnit("c.py");

    const lastDeepEvent = [...events]
      .reverse()
      .find((e) => e.stage === "deep-resource-ai");
    expect(lastDeepEvent!.partialFailures).toBe(1);
  });

  it("stages with zero work complete immediately at correct percent", () => {
    const events: SkillReviewProgress[] = [];
    const tracker = createProgressTracker("test-skill", (e) => events.push(e));

    // Skip deep (zero work) — go straight to synthesis
    tracker.completeStage("loading");
    tracker.completeStage("downloading");
    tracker.completeStage("deterministic-scan");
    tracker.completeStage("standard-ai");
    tracker.startDeepEvaluation(0); // zero work
    tracker.completeStage("file-synthesis");
    tracker.completeStage("bundle-synthesis");
    tracker.completeStage("persisting");

    // Deep stage weight (30%) is still consumed, just instantly
    expect(events[events.length - 1].percent).toBe(100);
  });

  it("exports STAGE_WEIGHTS summing to 100", () => {
    const total = Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("completedUnits and totalUnits reflect deep work", () => {
    const events: SkillReviewProgress[] = [];
    const tracker = createProgressTracker("test-skill", (e) => events.push(e));

    tracker.completeStage("loading");
    tracker.completeStage("downloading");
    tracker.completeStage("deterministic-scan");
    tracker.completeStage("standard-ai");
    tracker.startDeepEvaluation(3);
    tracker.completeDeepUnit("a.py");

    const ev = events.find(
      (e) => e.stage === "deep-resource-ai" && e.completedUnits === 1,
    );
    expect(ev).toBeDefined();
    expect(ev!.totalUnits).toBe(3);
  });
});
