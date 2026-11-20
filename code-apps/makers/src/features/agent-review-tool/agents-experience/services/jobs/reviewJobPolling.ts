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
  UNCLAIMED_STATUSES,
  ReviewJobStatus,
  ReviewJobError,
  type ReviewJobRow,
  type ReviewJobStatusValue,
} from '../../contracts/ReviewJob';

/** Escalating poll interval: responsive early, cheap once it is clearly long. */
export const POLL_SCHEDULE = [
  { untilMs: 30_000, everyMs: 2_000 },
  { untilMs: 180_000, everyMs: 5_000 },
  { untilMs: Infinity, everyMs: 10_000 },
] as const;

/** Client-side ceiling after workflow pickup. The server job is not cancelled. */
export const DEFAULT_DEADLINE_MS = 45 * 60 * 1000;

/**
 * How long a job may sit unclaimed before we conclude nothing will pick it up.
 *
 * Two shapes reach this. A browser can close between file upload and the final
 * Queued update, leaving a row that cannot trigger the workflow at all. And if
 * the workflow is turned off, deleted, or its trigger is broken, the row is set
 * Queued and then simply never claimed — there is no error to observe.
 *
 * Five minutes is generous relative to observed behaviour: a healthy workflow
 * moves the row to Running within seconds. Dataverse trigger delivery can be
 * delayed, so the check additionally requires that no child result row has
 * appeared, which means a slow-but-working run is never cut short.
 */
export const UNCLAIMED_JOB_TIMEOUT_MS = 5 * 60 * 1000;

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
  onPoll?: (row: ReviewJobRow, elapsedMs: number) => void | Promise<void>;
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
  let runningStartedAt: number | null = null;
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

    const observedAt = now();

    if (row) {
      // Awaited so a progress fetch cannot land out of order behind a later
      // poll. A slow callback stretches the interval rather than corrupting the
      // sequence.
      await onPoll?.(row, observedAt - start);

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

      if (
        row.cat_jobstatus === ReviewJobStatus.Running
        && runningStartedAt === null
      ) {
        runningStartedAt = observedAt;
      }

      // Nothing has claimed the job. Either it has no status — a recovered row
      // whose browser closed between upload and queueing, which cannot trigger
      // at all — or it is parked at a queued status because the workflow is off
      // or its trigger is broken. Both mean the AI stage is never coming, and
      // the caller degrades to a deterministic-only review rather than waiting
      // out the full deadline. The salvage gate keeps a slow-but-working run
      // alive: we only give up while no child result row has appeared.
      if (
        (row.cat_jobstatus == null
          || UNCLAIMED_STATUSES.includes(row.cat_jobstatus as ReviewJobStatusValue))
        && observedAt - start >= unclaimedTimeoutMs
        && !(await hasSalvageableResults?.().catch(() => false))
      ) {
        throw new ReviewJobError(
          'workflow-unavailable',
          'The review job was created but was not queued. Start the review again.',
        );
      }
    }

    // The deadline runs from workflow pickup, so a long queue does not eat the
    // run budget. It falls back to submission time when pickup never happens:
    // a row that stays Queued because the workflow is off or its trigger is
    // broken never sets `runningStartedAt`, and without this fallback the loop
    // would poll forever.
    const deadlineFrom = runningStartedAt ?? start;
    if (observedAt - deadlineFrom >= deadlineMs) {
      throw new ReviewJobError(
        'timeout',
        'The review workflow has run for 45 minutes without finishing. The server job was not cancelled. Reopen the app later to resume this review.',
      );
    }

    const elapsed = observedAt - start;
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
