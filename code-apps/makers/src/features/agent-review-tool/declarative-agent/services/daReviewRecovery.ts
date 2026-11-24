import type { DAPreparedReviewInput } from '../hooks/useDAReviewMutation';
import { redactSecrets } from '../../agents-experience/services/skill/resourceScanners';

const STORAGE_KEY = 'copilot-studio-kit:active-da-review:v1';
const RECOVERY_VERSION = 1;
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SENSITIVE_KEY =
  /(?:authorization|token|secret|password|api[_-]?key|client[_-]?secret|connection[_-]?string)/i;

export interface DAReviewRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DAReviewRecovery {
  version: 1;
  input: DAPreparedReviewInput;
  startedAt: number;
  jobId?: string;
}

function browserStorage(): DAReviewRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn(
      '[DeclarativeReview] Browser storage is unavailable; app restart recovery is disabled.',
      error,
    );
    return null;
  }

}

function sanitizeForStorage(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const sanitized = Array.isArray(value)
    ? value.map(item => sanitizeForStorage(item, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          SENSITIVE_KEY.test(key)
            ? '[REDACTED]'
            : sanitizeForStorage(child, seen),
        ]),
      );
  seen.delete(value);
  return sanitized;
}

function isPreparedInput(value: unknown): value is DAPreparedReviewInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<DAPreparedReviewInput>;
  const request = input.workflowRequest;
  return (
    (input.sourceType === 'zip' || input.sourceType === 'graph-api')
    && typeof input.componentIdUnique === 'string'
    && input.componentIdUnique.length > 0
    && Boolean(input.manifest && typeof input.manifest === 'object')
    && Boolean(input.manifestHealth && typeof input.manifestHealth === 'object')
    && Boolean(request && typeof request === 'object')
    && typeof request?.contractVersion === 'string'
    && typeof request?.correlationId === 'string'
    && request.correlationId.length > 0
    && Array.isArray(request.rules)
    && Array.isArray(request.evidence)
    && Array.isArray(input.retainedEvidence)
  );
}

function parseRecovery(value: unknown, now: number): DAReviewRecovery | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DAReviewRecovery>;
  if (
    candidate.version !== RECOVERY_VERSION
    || !isPreparedInput(candidate.input)
    || typeof candidate.startedAt !== 'number'
    || !Number.isFinite(candidate.startedAt)
    || (
      candidate.jobId !== undefined
      && (typeof candidate.jobId !== 'string' || candidate.jobId.length === 0)
    )
  ) {
    return null;
  }

  const age = now - candidate.startedAt;
  if (age < 0 || age > MAX_RECOVERY_AGE_MS) return null;
  return candidate as DAReviewRecovery;
}

/**
 * Creates a compact restart snapshot without raw plugin documents or images.
 */
export function createDAReviewRecovery(
  input: DAPreparedReviewInput,
  startedAt: number,
): DAReviewRecovery {
  const sanitizedInput = sanitizeForStorage({
    ...input,
    manifest: {
      ...input.manifest,
      iconBase64: null,
      pluginFiles: {},
    },
    retainedEvidence: input.workflowRequest.evidence,
  }) as DAPreparedReviewInput;
  return {
    version: RECOVERY_VERSION,
    input: sanitizedInput,
    startedAt,
  };
}

/** Saves one active Declarative Agent review. */
export function writeDAReviewRecovery(
  recovery: DAReviewRecovery,
  storage: DAReviewRecoveryStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(recovery));
    return true;
  } catch (error) {
    console.warn('[DeclarativeReview] Could not save restart recovery state.', error);
    return false;
  }
}

/** Reads one recent, valid Declarative Agent recovery snapshot. */
export function readDAReviewRecovery(
  storage: DAReviewRecoveryStorage | null = browserStorage(),
  now: number = Date.now(),
): DAReviewRecovery | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    const recovery = parseRecovery(JSON.parse(serialized) as unknown, now);
    if (!recovery) storage.removeItem(STORAGE_KEY);
    return recovery;
  } catch (error) {
    console.warn('[DeclarativeReview] Could not read restart recovery state.', error);
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (removeError) {
      console.warn(
        '[DeclarativeReview] Could not remove invalid recovery state.',
        removeError,
      );
    }
    return null;
  }
}

/** Removes recovery state after final persistence or explicit cancellation. */
export function clearDAReviewRecovery(
  storage: DAReviewRecoveryStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[DeclarativeReview] Could not clear restart recovery state.', error);
  }
}
