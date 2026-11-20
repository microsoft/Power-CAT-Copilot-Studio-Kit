import { describe, expect, it } from 'vitest';
import {
  buildCopilotReviewProgressStages,
  shouldShowCopilotReviewCancel,
} from '../components/copilotReviewProgressAdapter';

describe('copilot review progress adapter', () => {
  it('shows the same six steps at zero before the first progress event', () => {
    const stages = buildCopilotReviewProgressStages(null);
    const reported = buildCopilotReviewProgressStages({
      stage: 'loading', percent: 5, message: 'Loading configuration',
      completedUnits: 0, totalUnits: 1, partialFailures: 0,
    });

    expect(stages.map(stage => stage.stageName)).toEqual(reported.map(stage => stage.stageName));
    expect(stages.map(stage => stage.status)).toEqual([
      'active', 'pending', 'pending', 'pending', 'pending', 'pending',
    ]);
    expect(stages[0].progress).toBe(0);
    expect(stages.every(stage => stage.detail === undefined)).toBe(true);
  });

  it('fails only the first step at zero when an error precedes all progress', () => {
    const stages = buildCopilotReviewProgressStages(null, true);

    expect(stages).toHaveLength(6);
    expect(stages.map(stage => stage.status)).toEqual([
      'error', 'pending', 'pending', 'pending', 'pending', 'pending',
    ]);
    expect(stages[0].progress).toBe(0);
    expect(stages.some(stage => stage.status === 'active' || stage.status === 'completed')).toBe(false);
  });

  it('maps copilot progress into the standard six-stage review experience', () => {
    const stages = buildCopilotReviewProgressStages({
      stage: 'standard-ai',
      percent: 62,
      message: 'Evaluating skills',
      completedUnits: 1,
      totalUnits: 2,
      partialFailures: 0,
    });

    /*
     * `attribution` appears on Checking Compliance only. Every AI stage of the
     * Copilot pipeline collapses onto that index, and the workflow serves the
     * per-skill evaluation among them; the stages around it are load, download,
     * the deterministic rules and the save, which all run in the browser.
     *
     * There is no localStorage in the `node` test environment, so the resolver
     * falls back to the compiled default — currently `workflow`. Flipping that
     * default to roll spec 014 back will fail this line, which is the intended
     * signal rather than a nuisance: the mark must never outlive the backend.
     */
    expect(stages).toEqual([
      { stageName: 'Initializing', progress: 0, status: 'completed', detail: undefined },
      { stageName: 'Parsing Configuration', progress: 10, status: 'completed', detail: undefined },
      { stageName: 'Evaluating Patterns', progress: 30, status: 'completed', detail: undefined },
      {
        stageName: 'Checking Compliance',
        progress: 62,
        status: 'active',
        detail: 'Evaluating skills',
        attribution: 'workflow-agent',
      },
      { stageName: 'Saving Results', progress: 85, status: 'pending', detail: undefined },
      { stageName: 'Complete', progress: 100, status: 'pending', detail: undefined },
    ]);
  });

  it('carries the liveness ping on the active stage only', () => {
    // The workflow backend can sit in one stage for minutes; without this the
    // dialog is indistinguishable from a hung review.
    const stages = buildCopilotReviewProgressStages({
      stage: 'standard-ai',
      percent: 40,
      message: 'Review agent is analysing 3 components · Reviewed password-reset',
      completedUnits: 0,
      totalUnits: 3,
      partialFailures: 0,
    });

    expect(stages[3].detail).toContain('Reviewed password-reset');
    expect(stages.filter((s) => s.detail !== undefined)).toHaveLength(1);
  });

  it('drops the detail once the review is complete', () => {
    const stages = buildCopilotReviewProgressStages({
      stage: 'complete',
      percent: 100,
      message: 'Review complete',
      completedUnits: 0,
      totalUnits: 0,
      partialFailures: 0,
    });

    expect(stages.every((s) => s.detail === undefined)).toBe(true);
  });

  it('marks the active standard stage as failed when the copilot review errors', () => {
    const stages = buildCopilotReviewProgressStages({
      stage: 'deep-resource-ai',
      percent: 48,
      message: 'Evaluating resources',
      completedUnits: 2,
      totalUnits: 5,
      partialFailures: 0,
    }, true);

    expect(stages[3].status).toBe('error');
  });

  it('marks every standard stage complete when copilot review completes', () => {
    const stages = buildCopilotReviewProgressStages({
      stage: 'complete',
      percent: 100,
      message: 'Review complete',
      completedUnits: 0,
      totalUnits: 0,
      partialFailures: 0,
    });

    expect(stages).toHaveLength(6);
    expect(stages.every((stage) => stage.status === 'completed')).toBe(true);
  });

  it('shows a failure at the final stage when persistence fails after completion', () => {
    const stages = buildCopilotReviewProgressStages({
      stage: 'complete',
      percent: 100,
      message: 'Review complete',
      completedUnits: 0,
      totalUnits: 0,
      partialFailures: 0,
    }, true);

    expect(stages.slice(0, 5).every((stage) => stage.status === 'completed')).toBe(true);
    expect(stages[5].status).toBe('error');
  });

  it('does not claim that a browser action cancels a workflow run', () => {
    expect(shouldShowCopilotReviewCancel('workflow')).toBe(false);
  });

  it('keeps cancellation for the browser-owned prompt pipeline', () => {
    expect(shouldShowCopilotReviewCancel('prompt')).toBe(true);
  });
});
