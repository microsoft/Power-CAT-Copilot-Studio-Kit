/**
 * Polling for workflow-backed review jobs (spec 014 §5.5.2).
 *
 * Learn documents no push or subscription API for a Power Apps code app to be
 * notified of a Dataverse row change, so polling is the only supported path.
 * At the intervals below a single review costs roughly 40 requests against a
 * 6,000-per-5-minute service protection budget.
 */

/** Escalating poll interval: responsive early, cheap once it is clearly long. */
export const POLL_SCHEDULE = [
  { untilMs: 30_000, everyMs: 2_000 },
  { untilMs: 180_000, everyMs: 5_000 },
  { untilMs: Infinity, everyMs: 10_000 },
] as const;

/** Client-side ceiling. The job keeps running server-side after this fires. */
export const DEFAULT_DEADLINE_MS = 45 * 60 * 1000;

/**
 * How long a job may sit Queued before we conclude nothing will pick it up.
 *
 * If the workflow is turned off, deleted, or its trigger is broken, the row is
 * created and set Queued and then simply never claimed — there is no error to
 * observe. Without this the client would poll for the full 45-minute deadline
 * before giving up, so a disabled workflow looked like a hung review rather
 * than a backend that is unavailable.
 *
 * Generous relative to observed behaviour: a healthy workflow moves the row to
 * Running within a few seconds, and the check additionally requires that no
 * child row has appeared, so a slow-but-working run is never cut short.
 */
export const UNCLAIMED_JOB_TIMEOUT_MS = 3 * 60 * 1000;

/** Returns the poll interval for a given elapsed time. */
export function pollIntervalFor(elapsedMs: number): number {
  for (const step of POLL_SCHEDULE) {
    if (elapsedMs < step.untilMs) return step.everyMs;
  }
  return POLL_SCHEDULE[POLL_SCHEDULE.length - 1].everyMs;
}

/**
 * Maps a workflow error message onto a client error code so the UI can explain
 * capacity exhaustion differently from a genuine failure.
 */
export function classifyFailure(message: string | undefined): 'capacity' | 'throttled' | 'workflow-failed' {
  const text = (message ?? '').toLowerCase();
  if (/capacity|quota|credits|entitlement/.test(text)) return 'capacity';
  if (/throttl|too many requests|rate limit/.test(text)) return 'throttled';
  return 'workflow-failed';
}
