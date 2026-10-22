/**
 * Polling for workflow-backed review jobs (spec 014 §5.5.2).
 *
 * Learn documents no push or subscription API for a Power Apps code app to be
 * notified of a Dataverse row change, so polling is the only supported path.
 * At the intervals below a single review costs roughly 40 requests against a
 * 6,000-per-5-minute service protection budget.
 */
import {
  TERMINAL_STATUSES,
  ReviewJobStatus,
  ReviewJobError,
  type ReviewJobRow,
  type ReviewJobStatusValue,
} from '../../contracts/ReviewJob.js';

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

/** Backoff ceiling applied after a 429 with no `Retry-After` header. */
const MAX_THROTTLE_BACKOFF_MS = 30_000;

/** Returns the poll interval for a given elapsed time. */
export function pollIntervalFor(elapsedMs: number): number {
  for (const step of POLL_SCHEDULE) {
    if (elapsedMs < step.untilMs) return step.everyMs;
  }
  return POLL_SCHEDULE[POLL_SCHEDULE.length - 1].everyMs;
}

/** True when the row has reached a state polling should stop on. */
export function isTerminal(status: ReviewJobStatusValue | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.includes(status);
}

/**
 * Detects a Dataverse service protection response and extracts its retry hint.
 * Returns null when the error is not a throttling response.
 */
export function throttleDelayMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { status?: number; statusCode?: number; headers?: Record<string, string>; message?: string };
  const status = e.status ?? e.statusCode;
  const looksThrottled = status === 429 || /too many requests|429/i.test(e.message ?? '');
  if (!looksThrottled) return null;

  const header = e.headers?.['retry-after'] ?? e.headers?.['Retry-After'];
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_THROTTLE_BACKOFF_MS);
  }
  return MAX_THROTTLE_BACKOFF_MS;
}

export interface PollOptions {
  /** Reads the current row. Injected so tests need no Dataverse. */
  getJob: () => Promise<ReviewJobRow>;
  /** Called on every observed row, for progress reporting. Awaited. */
  onPoll?: (row: ReviewJobRow) => void | Promise<void>;
  /** Cancels polling. The server-side job is not affected. */
  signal?: AbortSignal;
  /** Overall client ceiling. Defaults to {@link DEFAULT_DEADLINE_MS}. */
  deadlineMs?: number;
  /** Injected sleep, for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected clock, for deterministic tests. */
  now?: () => number;
  /** Overrides {@link UNCLAIMED_JOB_TIMEOUT_MS}, for deterministic tests. */
  unclaimedTimeoutMs?: number;
  /**
   * Asked only when the job reports Failed: are there usable per-component
   * results despite the failure?
   *
   * Logic Apps marks a foreach `Failed` if any single iteration fails, and the
   * workflow's failure branch then marks the whole job Failed. Throwing on that
   * discards the rows the successful iterations already wrote — on a four-skill
   * agent, one flaky iteration would lose the entire review. Each iteration
   * inserts its row independently, so those results are intact and worth
   * keeping.
   *
   * Returning true makes the poll resolve so the caller can read what exists
   * and report a partial review. A read failure here must return false, not
   * throw: an unanswerable question falls back to the stricter behaviour.
   */
  hasSalvageableResults?: () => Promise<boolean>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls a job row until it reaches a terminal state.
 *
 * Transient read failures are tolerated — a single failed poll must not fail a
 * review that is progressing normally. Throttling responses honour
 * `Retry-After`. Aborting rejects with a `cancelled` error and stops polling.
 *
 * @param options - Poll configuration.
 * @returns The terminal row.
 */
export async function pollReviewJob(options: PollOptions): Promise<ReviewJobRow> {
  const {
    getJob,
    onPoll,
    signal,
    deadlineMs = DEFAULT_DEADLINE_MS,
    sleep = defaultSleep,
    now = () => Date.now(),
    unclaimedTimeoutMs = UNCLAIMED_JOB_TIMEOUT_MS,
    hasSalvageableResults,
  } = options;

  const start = now();
  let consecutiveFailures = 0;

  for (;;) {
    if (signal?.aborted) {
      throw new ReviewJobError('cancelled', 'Review cancelled.');
    }

    let row: ReviewJobRow | null = null;
    try {
      row = await getJob();
      consecutiveFailures = 0;
    } catch (err) {
      const throttle = throttleDelayMs(err);
      if (throttle !== null) {
        await sleep(throttle);
        continue;
      }
      consecutiveFailures += 1;
      // Three consecutive hard failures means the row is genuinely unreachable.
      if (consecutiveFailures >= 3) {
        throw new ReviewJobError(
          'workflow-failed',
          `Could not read the review job: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (row) {
      // Awaited so a progress fetch cannot land out of order behind a later
      // poll. A slow callback stretches the interval rather than corrupting the
      // sequence.
      await onPoll?.(row);

      if (isTerminal(row.cat_jobstatus)) {
        if (row.cat_jobstatus === ReviewJobStatus.Failed) {
          // One failed loop iteration marks the whole foreach Failed, which the
          // workflow propagates to the job. The rows written by the iterations
          // that succeeded are still valid, so ask before discarding them.
          const salvageable = hasSalvageableResults
            ? await hasSalvageableResults().catch(() => false)
            : false;
          if (!salvageable) {
            throw new ReviewJobError(
              classifyFailure(row.cat_errormessage),
              row.cat_errormessage ?? 'The review workflow reported a failure.',
            );
          }
        }
        return row;
      }

      // Nothing has claimed the job. A recovered row can briefly have no status
      // if the previous browser closed between upload and queueing. Treat that
      // state like Queued so an orphaned pre-trigger row cannot poll for 45
      // minutes.
      if (
        (row.cat_jobstatus == null
          || row.cat_jobstatus === ReviewJobStatus.Queued) &&
        now() - start >= unclaimedTimeoutMs &&
        !(await hasSalvageableResults?.().catch(() => false))
      ) {
        throw new ReviewJobError(
          'workflow-unavailable',
          'The review workflow did not pick up this job. It may be turned off in this environment. Deterministic checks are still available.',
        );
      }
    }

    const elapsed = now() - start;
    if (elapsed >= deadlineMs) {
      // Deliberately does not promise the review can be reopened. The results
      // are assembled and saved by the client, so when the client stops
      // waiting nothing writes the review row — there is no review to return
      // to. Saying otherwise sent the user to look for a record that is never
      // created. Restore the promise only once a job can be resumed by its
      // `cat_botid`.
      throw new ReviewJobError(
        'timeout',
        'The review did not finish within 45 minutes. The workflow may still be running in your environment, but this result was not saved. Start the review again to retry.',
      );
    }

    await sleep(pollIntervalFor(elapsed));
  }
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
