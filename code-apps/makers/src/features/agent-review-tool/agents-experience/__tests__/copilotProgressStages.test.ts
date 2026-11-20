/**
 * Copilot review progress mapped onto the shared stepper.
 *
 * Re-running a saved Copilot review showed a thin inline bar while every other
 * review in the product showed the stepper dialog, so the same action looked
 * like two different products. These pin the mapping that removes the split.
 */
import { describe, expect, it } from 'vitest';

import {
  copilotProgressToStages,
  copilotStageDetail,
  stageRank,
} from '../components/copilotProgressStages';
import type { SkillReviewProgress } from '../contracts/SkillBundle';

const at = (
  stage: SkillReviewProgress['stage'],
  over: Partial<SkillReviewProgress> = {},
): SkillReviewProgress => ({
  stage,
  percent: 15,
  message: 'Collecting agent components',
  completedUnits: 0,
  totalUnits: 4,
  partialFailures: 0,
  ...over,
});

describe('copilotProgressToStages', () => {
  it('shows every phase as pending before the first report', () => {
    const stages = copilotProgressToStages(null);
    expect(stages).toHaveLength(6);
    expect(stages.every(s => s.status === 'pending')).toBe(true);
  });

  it('marks exactly one phase active', () => {
    const stages = copilotProgressToStages(at('standard-ai'));
    expect(stages.filter(s => s.status === 'active')).toHaveLength(1);
    expect(stages.find(s => s.status === 'active')?.stageName).toBe('Evaluating skills');
  });

  it('completes the phases already passed', () => {
    const stages = copilotProgressToStages(at('standard-ai'));
    expect(stages.slice(0, 3).every(s => s.status === 'completed')).toBe(true);
    expect(stages.slice(4).every(s => s.status === 'pending')).toBe(true);
  });

  it('collapses the three deep stages into one phase', () => {
    for (const stage of ['deep-resource-ai', 'file-synthesis', 'bundle-synthesis'] as const) {
      const active = copilotProgressToStages(at(stage)).find(s => s.status === 'active');
      expect(active?.stageName, stage).toBe('Analysing resources');
    }
  });

  it('completes every phase once the run finishes', () => {
    // A skill with no resources never enters the deep stages, so those rows must
    // still settle rather than spin forever.
    const stages = copilotProgressToStages(at('complete', { percent: 100 }));
    expect(stages.every(s => s.status === 'completed' || s.status === 'active')).toBe(true);
    expect(stages.filter(s => s.status === 'pending')).toHaveLength(0);
  });

  it('shows the active phase as errored when the review failed', () => {
    const stages = copilotProgressToStages(at('standard-ai'), true);
    expect(stages.find(s => s.status === 'error')?.stageName).toBe('Evaluating skills');
    expect(stages.some(s => s.status === 'active')).toBe(false);
  });

  it('attaches live detail only to the active phase', () => {
    const stages = copilotProgressToStages(at('downloading'));
    const withDetail = stages.filter(s => s.detail);
    expect(withDetail).toHaveLength(1);
    expect(withDetail[0].stageName).toBe('Downloading skill files');
  });
});

describe('stageRank', () => {
  it('orders the pipeline so a caller can hold progress monotonic', () => {
    // The reported bug: after "Downloading skill files" the workflow's submit
    // phase arrives as `loading`, which is EARLIER, and the stepper walked back
    // to "Loading configuration". A caller compares ranks to refuse that.
    expect(stageRank('loading')).toBeLessThan(stageRank('downloading'));
    expect(stageRank('downloading')).toBeLessThan(stageRank('standard-ai'));
    expect(stageRank('standard-ai')).toBeLessThan(stageRank('complete'));
  });

  it('returns -1 for a stage it does not know', () => {
    expect(stageRank('nonsense' as never)).toBe(-1);
  });
});

describe('copilotStageDetail', () => {
  it('reproduces the line the old inline bar showed', () => {
    expect(copilotStageDetail(at('loading')))
      .toBe('Collecting agent components · 0 / 4 units');
  });

  it('does not print the same count twice', () => {
    // The workflow phrases its message as "Reviewed 0 of 4 skills", which is the
    // same pair of numbers the unit counter prints. Both gave
    // "Reviewed 0 of 4 skills · 0 / 4 units".
    expect(copilotStageDetail(at('standard-ai', { message: 'Reviewed 0 of 4 skills' })))
      .toBe('Reviewed 0 of 4 skills');
    expect(copilotStageDetail(at('standard-ai', { message: 'Reviewed 2 of 4 skills', completedUnits: 2 })))
      .toBe('Reviewed 2 of 4 skills');
  });

  it('still shows units when the message counts something else', () => {
    expect(copilotStageDetail(at('deep-resource-ai', { message: 'Analysed 1 of 9 files' })))
      .toContain('0 / 4 units');
  });

  it('names the resource being analysed', () => {
    const detail = copilotStageDetail(at('deep-resource-ai', {
      message: 'Analysing', resourcePath: 'scripts/cleanup.py', completedUnits: 2,
    }));
    expect(detail).toContain('scripts/cleanup.py');
    expect(detail).toContain('2 / 4 units');
  });

  it('surfaces partial failures so a degraded run is visible', () => {
    expect(copilotStageDetail(at('standard-ai', { partialFailures: 2 })))
      .toContain('2 failures');
    expect(copilotStageDetail(at('standard-ai', { partialFailures: 1 })))
      .toContain('1 failure');
  });

  it('returns nothing when there is nothing to say', () => {
    expect(copilotStageDetail(null)).toBeUndefined();
    expect(copilotStageDetail(at('loading', { message: '', totalUnits: 0 }))).toBeUndefined();
  });
});
