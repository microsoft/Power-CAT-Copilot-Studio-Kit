/**
 * Elapsed-time helper for review progress.
 *
 * Separate from `ReviewWaitFooter` so that file exports a component and nothing
 * else — the fast-refresh rule rejects mixing the two.
 *
 * Nothing renders this number. It once drove a visible clock, which was removed
 * because none of the reader's choices change on it and a stopwatch on a wait
 * nobody can influence only makes the wait feel longer. What remains is a single
 * question the footer does need answered: has this run passed the point where it
 * deserves an explanation?
 */
import { useEffect, useState } from 'react';

/**
 * How often the elapsed value is refreshed.
 *
 * Was one second, to keep a visible clock honest. With the clock gone the only
 * consumer is a minutes-long threshold, so a one-second tick would re-render the
 * dialog roughly two hundred and forty times to answer a question that changes
 * once. Ten seconds keeps the slow note punctual to well within the tolerance of
 * a four-minute threshold.
 */
const TICK_MS = 10_000;

/**
 * Elapsed milliseconds for the current run.
 *
 * Driven from a caller-owned start timestamp rather than mount time: the
 * progress dialog remounts as stages change, and a locally-owned clock would
 * restart with it and under-report how long the user has actually waited.
 *
 * @param startedAt - Epoch ms when the run began, or null when none is running.
 * @param running - False stops the ticking, so a failed run keeps the time it
 * took to fail rather than counting on while the error is read.
 */
export function useElapsed(
  startedAt: number | null | undefined,
  running: boolean,
): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || !running) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [startedAt, running]);

  if (!startedAt) return null;
  return Math.max(0, now - startedAt);
}
