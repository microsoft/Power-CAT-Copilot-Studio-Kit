/**
 * aiErrorClassifier
 *
 * Translates raw PredictV2 / Dataverse connector errors raised during the review
 * pipeline (Stage B/C/D AI model invocations) into user-actionable guidance.
 *
 * The most common silent failure is a missing AI capacity / Copilot Studio credits
 * in the target environment: PredictV2 returns an opaque connector error
 * (e.g. "commondataserviceforapps", 402/403, or messages mentioning credits/
 * capacity/quota). Surfacing the raw text to a maker is meaningless — this helper
 * maps it to a clear explanation and signals whether retrying could plausibly help.
 */
import { ReviewJobError } from '../agents-experience/contracts/ReviewJob';
import { UNSUPPORTED_HARNESS_MESSAGE, UnsupportedHarnessError } from '../agents-experience/services/detection';

/**
 * Classification of an AI pipeline error.
 */
export interface ClassifiedAIError {
  /**
   * Error category:
   * - `capacity`  — AI capacity / credits not available in the environment. Retry will not help.
   * - `transient` — throttling, timeout, or service-busy. Retry may help.
   * - `unknown`   — anything else. Retry shown as a best-effort fallback, but not for an unsupported harness.
   */
  kind: 'capacity' | 'transient' | 'unknown';
  /** Short title for the MessageBar. */
  title: string;
  /** User-actionable message body. */
  message: string;
  /** Whether a Retry action should be offered (false for capacity errors and for an unsupported harness). */
  canRetry: boolean;
  /** Optional docs link surfaced as a "Learn more" action. */
  learnMoreUrl?: string;
  /**
   * Raw / extracted technical detail for diagnostics. Often internal jargon
   * (e.g. "Connection reference not found: commondataserviceforapps"), so it is
   * shown only in a collapsible "Show details" area, never as the primary text.
   * Undefined when the primary message already conveys everything (e.g. capacity).
   */
  technicalDetail?: string;
}

/** Docs reference for enabling AI capacity / Copilot Studio billing. */
const AI_CAPACITY_DOCS_URL =
  'https://learn.microsoft.com/microsoft-copilot-studio/requirements-messages-management';

/**
 * Fully serialize an unknown error into a single lowercase searchable string.
 *
 * PredictV2 capacity errors arrive as a nested structure where the meaningful
 * tokens live inside a JSON string nested in `error.message`, e.g.:
 *   { error: { code: "0x80048d06",
 *              message: "{...\"code\":\"EntitlementNotAvailable\"...
 *                          \"code\":\"NoCapacity\"...}" } }
 * The error may reach this function as an Error, a plain object, or a JSON
 * string depending on how the pipeline rethrew it. To detect the signal
 * regardless of wrapping, we flatten the entire payload (own + nested) to text.
 */
function serializeError(error: unknown): { text: string; status: number } {
  let status = 0;
  const parts: string[] = [];

  const collect = (value: unknown, depth: number): void => {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
      parts.push(value);
      // Inner messages are frequently JSON strings — parse and recurse so the
      // tokens inside (EntitlementNotAvailable / NoCapacity) become searchable.
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          collect(JSON.parse(trimmed), depth + 1);
        } catch {
          /* not JSON — already captured as raw text */
        }
      }
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.status === 'number' && status === 0) status = obj.status;
      for (const key of Object.keys(obj)) {
        parts.push(key);
        collect(obj[key], depth + 1);
      }
    }
  };

  if (error instanceof Error) {
    const maybeStatus = (error as { status?: number }).status;
    if (typeof maybeStatus === 'number') status = maybeStatus;
    collect(error.message, 0);
  } else {
    collect(error, 0);
  }

  return { text: parts.join(' ').toLowerCase(), status };
}

/**
 * Exact, stable tokens emitted by Dataverse/PredictV2 when the environment has
 * no AI capacity / entitlement. These are the authoritative signals — verified
 * against a real "no capacity" response — and make detection deterministic.
 */
const CAPACITY_TOKENS = [
  'entitlementnotavailable',
  'nocapacity',
  '0x80048d06',
];

/**
 * Secondary capacity hints. Used only as a fallback if the exact tokens above
 * are ever reworded by the platform. Kept conservative to avoid false positives.
 */
const CAPACITY_FALLBACK_HINTS = [
  'no capacity was found',
  'capacity was found',
];

/** Keywords that indicate a transient, retryable failure. */
const TRANSIENT_HINTS = [
  'timeout',
  'timed out',
  'throttl',
  'too many requests',
  'service unavailable',
  'temporarily',
  'gateway',
  'try again',
];

/**
 * Classify an AI pipeline error into actionable guidance.
 *
 * @param error - The error thrown by the review mutation / AIService.
 * @returns A ClassifiedAIError with friendly title/message and retry guidance.
 */
export function classifyAIError(error: unknown): ClassifiedAIError {
  if (error instanceof UnsupportedHarnessError) {
    return {
      kind: 'unknown',
      title: 'Harness not supported',
      message: UNSUPPORTED_HARNESS_MESSAGE,
      canRetry: false,
    };
  }
  const { text, status } = serializeError(error);

  const isCapacity =
    CAPACITY_TOKENS.some((token) => text.includes(token)) ||
    CAPACITY_FALLBACK_HINTS.some((hint) => text.includes(hint));

  if (isCapacity) {
    return {
      kind: 'capacity',
      title: 'AI capacity not available',
      message:
        'This environment doesn\'t have the AI capacity required to run an agent review. ' +
        'Agent review uses Copilot Studio / AI Builder credits. Ask your administrator to ' +
        'enable AI capacity for this environment, then run the review again.',
      canRetry: false,
      learnMoreUrl: AI_CAPACITY_DOCS_URL,
    };
  }

  const isTransient =
    status === 408 ||
    status === 429 ||
    status === 503 ||
    status === 504 ||
    TRANSIENT_HINTS.some((hint) => text.includes(hint));

  if (isTransient) {
    return {
      kind: 'transient',
      title: 'AI service unavailable',
      message:
        'The AI service was busy or timed out while reviewing this agent. ' +
        'This is usually temporary — please try again in a moment.',
      canRetry: true,
    };
  }

  const detail = extractReadableMessage(error);
  return {
    kind: 'unknown',
    title: 'Review couldn\'t be completed',
    message:
      'Something went wrong while reviewing this agent. Please try again. ' +
      'If the problem continues, contact your administrator and share the details below.',
    canRetry: true,
    // Only attach detail when it adds signal beyond the generic fallback text.
    technicalDetail:
      detail && detail !== 'An unexpected error occurred while reviewing this agent.'
        ? detail
        : undefined,
  };
}

/**
 * Classifies a Standard review error without offering actions that can create
 * a duplicate server job.
 */
export function classifyStandardReviewError(error: unknown): ClassifiedAIError {
  const classified = classifyAIError(error);
  if (!(error instanceof ReviewJobError)) return classified;

  if (error.code === 'timeout') {
    return {
      ...classified,
      title: 'Review is still running',
      message: error.message,
      canRetry: false,
      technicalDetail: undefined,
    };
  }

  if (error.code === 'capacity') {
    return { ...classified, canRetry: false };
  }

  return classified;
}

/**
 * Pull the most human-readable message out of an arbitrary error.
 *
 * PredictV2 failures often arrive as deeply-nested JSON (e.g.
 * `{ error: { message: "{...\"message\":\"No capacity was found.\"...}" } }`).
 * Dumping that raw blob into the dialog is unfriendly, so we walk the structure
 * and surface the innermost `message` string when one exists. Falls back to the
 * raw text — we never hide the error, we just present it better.
 */
function extractReadableMessage(error: unknown): string {
  const FALLBACK = 'An unexpected error occurred while reviewing this agent.';
  // Collected values found under `message` keys (the human-readable fields),
  // deepest-first so the innermost sentence wins (e.g. "No capacity was found.").
  const found: string[] = [];

  const walk = (value: unknown, depth: number): void => {
    if (depth > 12 || value == null) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          walk(JSON.parse(trimmed), depth + 1);
          return;
        } catch {
          /* not JSON — fall through */
        }
      }
      // A plain, non-JSON message string is a leaf human message.
      if (trimmed) found.push(trimmed);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      // Only follow `error` / `innerErrors` / `message` — the fields that carry
      // human text or nest deeper errors. Ignore `code`, `type`, `scope`, etc.
      for (const key of ['error', 'innererrors', 'innererror', 'message']) {
        const match = Object.keys(obj).find((k) => k.toLowerCase() === key);
        if (match) walk(obj[match], depth + 1);
      }
    }
  };

  walk(error instanceof Error ? error.message : error, 0);

  // The deepest message is appended last; prefer it (most specific). Skip any
  // residual JSON-looking strings.
  const readable = [...found]
    .reverse()
    .find((m) => !m.startsWith('{') && !m.startsWith('['));

  return readable ?? (error instanceof Error && error.message ? error.message : FALLBACK);
}

/** Consistent tag so users can filter the browser console when filing an issue. */
const LOG_TAG = '[Agent Review]';

/**
 * Emit a single, consistently-tagged diagnostic to the browser console at the
 * point a review fails. Designed for the support loop: ask the user to filter
 * their console for `[Agent Review]` and paste the output into a GitHub issue.
 *
 * Uses `console.error` (preserved in production builds) and a collapsed group so
 * the full raw error object is available without flooding the console.
 *
 * @param context   - Where the failure happened, e.g. "CS Review" or "DA Review".
 * @param error     - The original, unmodified error thrown by the pipeline.
 * @param classified - The result of {@link classifyAIError} for the same error.
 */
export function logReviewError(
  context: string,
  error: unknown,
  classified: ClassifiedAIError
): void {
  console.error(
    `${LOG_TAG} ${context} failed — ${classified.kind}: ${classified.message}`
  );
  console.error(`${LOG_TAG} timestamp:`, new Date().toISOString());
  if (classified.technicalDetail) {
    console.error(`${LOG_TAG} detail:`, classified.technicalDetail);
  }
  // Full raw error last — the most valuable payload for debugging.
  console.error(`${LOG_TAG} raw error:`, error);
}
