import { describe, expect, it } from 'vitest';
import { buildCopilotReviewProgressStages } from '../components/copilotReviewProgressAdapter';

describe('progress stepper never moves backwards', () => {
  it('advances from the initial rows without changing their order', () => {
    const initial = buildCopilotReviewProgressStages(null);
    const reported = buildCopilotReviewProgressStages({
      stage: 'loading', percent: 5, message: 'Loading',
      completedUnits: 0, totalUnits: 1, partialFailures: 0,
    }, false, initial);

    expect(initial[0]?.status).toBe('active');
    expect(reported[1].status).toBe('active');
    expect(reported.map(stage => stage.stageName)).toEqual(initial.map(stage => stage.stageName));
  });

  it('keeps the last reached step when progress is temporarily absent', () => {
    const advanced = buildCopilotReviewProgressStages({
      stage: 'standard-ai', percent: 60, message: 'Evaluating',
      completedUnits: 0, totalUnits: 1, partialFailures: 0,
    });
    const waiting = buildCopilotReviewProgressStages(null, false, advanced);
    const failed = buildCopilotReviewProgressStages(null, true, advanced);

    expect(waiting[3]?.status).toBe('active');
    expect(waiting[3]?.progress).toBe(60);
    expect(failed[3]?.status).toBe('error');
    expect(failed.some(stage => stage.status === 'active')).toBe(false);
    expect(failed.slice(0, 3).every(stage => stage.status === 'completed')).toBe(true);
  });

  it('starts a fresh review at zero when no previous stages are supplied', () => {
    const advanced = buildCopilotReviewProgressStages({
      stage: 'persisting', percent: 90, message: 'Saving',
      completedUnits: 1, totalUnits: 1, partialFailures: 0,
    });
    const fresh = buildCopilotReviewProgressStages(null);

    expect(advanced[4].status).toBe('active');
    expect(fresh[0]?.status).toBe('active');
    expect(fresh[0]?.progress).toBe(0);
    expect(fresh.some(stage => stage.status === 'completed')).toBe(false);
  });

  it('holds the furthest stage when a later bundle re-emits an early stage', () => {
    // Per-bundle loops re-emit `loading` after an earlier bundle reached
    // `standard-ai`; naively mapped the stepper reverted to Parsing.
    const advanced = buildCopilotReviewProgressStages(
      { stage: 'standard-ai', percent: 60, message: 'Evaluating' } as never,
      false,
    );
    expect(advanced[3].status).toBe('active');

    const reverted = buildCopilotReviewProgressStages(
      { stage: 'loading', percent: 5, message: 'Loading next bundle' } as never,
      false,
      advanced,
    );
    expect(reverted[3].status).toBe('active');
    expect(reverted[1].status).toBe('completed');
  });

  it('still advances forwards', () => {
    const early = buildCopilotReviewProgressStages(
      { stage: 'loading', percent: 5, message: 'Loading' } as never,
      false,
    );
    const later = buildCopilotReviewProgressStages(
      { stage: 'persisting', percent: 90, message: 'Saving' } as never,
      false,
      early,
    );
    expect(later[4].status).toBe('active');
  });

  it('is unchanged when no previous stages are supplied', () => {
    const stages = buildCopilotReviewProgressStages(
      { stage: 'loading', percent: 5, message: 'Loading' } as never,
      false,
    );
    expect(stages[1].status).toBe('active');
  });
});
