/** State of one step in a progress step list. */
export type StepState = 'done' | 'active' | 'pending' | 'skipped';

/**
 * Share of non-skipped steps that are done, plus an optional fraction of the
 * active step. `weights` gives each step its share (default 1 each), so a step
 * that takes most of the time can move most of the bar.
 */
export function stepProgress(states: StepState[], activeFraction = 0, weights?: readonly number[]): number {
  const weight = (index: number) => weights?.[index] ?? 1;
  const total = states.reduce((sum, state, i) => (state === 'skipped' ? sum : sum + weight(i)), 0);
  if (total === 0) return 0;
  const fraction = Math.min(Math.max(activeFraction, 0), 1);
  const activeIndex = states.indexOf('active');
  const done = states.reduce((sum, state, i) => (state === 'done' ? sum + weight(i) : sum), 0);
  return (done + (activeIndex >= 0 ? weight(activeIndex) * fraction : 0)) / total;
}
