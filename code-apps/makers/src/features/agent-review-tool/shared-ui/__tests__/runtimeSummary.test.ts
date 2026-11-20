/**
 * The timing card is the only metric whose label depends on the data, and getting it wrong is
 * silent: "0 ms" reads as a fast agent rather than as an unmeasured one.
 */

import { describe, expect, it } from 'vitest';
import { timingCard, type RuntimeMetricsSummary } from '../runtimeSummary';

function summary(overrides: Partial<RuntimeMetricsSummary> = {}): RuntimeMetricsSummary {
  return {
    transcriptsAnalyzed: 10, transcriptRowsAnalyzed: 40, conversationsWithErrors: 2,
    errorRatePercent: 20, uniqueErrorTypes: 1, totalErrors: 3, totalToolCalls: 8,
    avgStepMs: 0, totalSteps: 0, totalKnowledgeSearches: 5, ...overrides,
  };
}

describe('timingCard', () => {
  it('reports plan-step timing when the transcripts recorded steps', () => {
    expect(timingCard(summary({ totalSteps: 120, avgStepMs: 1500, avgToolMs: 90 }))).toEqual({
      label: 'Average step time', value: '1.5 s', detail: '120 steps',
    });
  });

  it('falls back to tool timing rather than reporting an agent as instant', () => {
    // Newer agents emit tool-call traces instead of DynamicPlanStepFinished. `avgStepMs` is a real
    // zero there, and rendering it would claim every step took no time at all.
    expect(timingCard(summary({ totalSteps: 0, avgStepMs: 0, avgToolMs: 250, totalToolCalls: 8 }))).toEqual({
      label: 'Average tool time', value: '250 ms', detail: '8 tool calls',
    });
  });

  it('says nothing was recorded rather than inventing a number', () => {
    for (const absent of [{}, { avgToolMs: 0 }, { avgToolMs: 250, totalToolCalls: 0 }]) {
      expect(timingCard(summary(absent))).toEqual({
        label: 'Average step time', value: '—', detail: 'Not recorded in these transcripts',
      });
    }
  });

  it('keeps the card in the layout while the first analysis is still running', () => {
    // No summary means pending, not "nothing was recorded" — the row must not change width.
    expect(timingCard(undefined)).toEqual({ label: 'Average step time', value: '0 ms' });
  });

  it('prefers steps over tools when a transcript happens to carry both', () => {
    const both = summary({ totalSteps: 4, avgStepMs: 4000, avgToolMs: 10, totalToolCalls: 99 });
    expect(timingCard(both).label).toBe('Average step time');
    expect(timingCard(both).value).toBe('4.0 s');
  });

  it('uses the singular for a count of one', () => {
    expect(timingCard(summary({ totalSteps: 1, avgStepMs: 10 })).detail).toBe('1 step');
    expect(timingCard(summary({ avgToolMs: 10, totalToolCalls: 1 })).detail).toBe('1 tool call');
  });
});
