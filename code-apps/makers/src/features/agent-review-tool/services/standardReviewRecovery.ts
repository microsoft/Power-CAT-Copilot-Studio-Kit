import type { ReviewExecutionInput } from '../hooks/useReviewMutation';

const STORAGE_KEY = 'copilot-studio-kit:active-standard-review:v1';
const RECOVERY_VERSION = 1;
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StandardReviewRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RecoverableStandardReviewInput {
  botId: string;
  botName: string;
  componentIdUnique: string;
  orgUrl?: string | null;
  sourceEnvironment?: string;
  agentVersion?: string;
}

export interface StandardReviewRecovery {
  version: 1;
  input: RecoverableStandardReviewInput;
  environmentId?: string | null;
  returnPath: string;
  startedAt: number;
  jobId?: string;
}

function browserStorage(): StandardReviewRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn(
      '[StandardReview] Browser storage is unavailable; app restart recovery is disabled.',
      error,
    );
    return null;
  }
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function parseRecovery(
  value: unknown,
  now: number,
): StandardReviewRecovery | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StandardReviewRecovery>;
  const input = candidate.input as
    | Partial<RecoverableStandardReviewInput>
    | undefined;

  if (
    candidate.version !== RECOVERY_VERSION
    || !input
    || typeof input.botId !== 'string'
    || input.botId.length === 0
    || typeof input.botName !== 'string'
    || input.botName.length === 0
    || typeof input.componentIdUnique !== 'string'
    || input.componentIdUnique.length === 0
    || !isOptionalString(input.orgUrl)
    || !isOptionalString(input.sourceEnvironment)
    || !isOptionalString(input.agentVersion)
    || !isOptionalString(candidate.environmentId)
    || typeof candidate.returnPath !== 'string'
    || !candidate.returnPath.startsWith('/')
    || typeof candidate.startedAt !== 'number'
    || !Number.isFinite(candidate.startedAt)
    || !isOptionalString(candidate.jobId)
  ) {
    return null;
  }

  const age = now - candidate.startedAt;
  if (age < 0 || age > MAX_RECOVERY_AGE_MS) return null;

  return candidate as StandardReviewRecovery;
}

/**
 * Creates the restart-safe subset of a live Standard review request.
 *
 * ZIP reviews keep running across in-app navigation, but their File bytes are
 * not written to browser storage.
 */
export function createStandardReviewRecovery(
  input: ReviewExecutionInput,
  environmentId: string | null | undefined,
  returnPath: string,
  startedAt: number,
): StandardReviewRecovery | null {
  if (input.zipFile || input.sourceEnvironment === 'zip') return null;

  return {
    version: RECOVERY_VERSION,
    input: {
      botId: input.botId,
      botName: input.botName,
      componentIdUnique: input.componentIdUnique,
      orgUrl: input.orgUrl,
      sourceEnvironment: input.sourceEnvironment,
      ...(input.agentVersion ? { agentVersion: input.agentVersion } : {}),
    },
    environmentId,
    returnPath,
    startedAt,
    jobId: input.existingJobId,
  };
}

/** Saves recovery state before asynchronous review work starts. */
export function writeStandardReviewRecovery(
  recovery: StandardReviewRecovery,
  storage: StandardReviewRecoveryStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(recovery));
    return true;
  } catch (error) {
    console.warn('[StandardReview] Could not save restart recovery state.', error);
    return false;
  }
}

/** Reads one recent, valid live Standard review recovery record. */
export function readStandardReviewRecovery(
  storage: StandardReviewRecoveryStorage | null = browserStorage(),
  now: number = Date.now(),
): StandardReviewRecovery | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    const recovery = parseRecovery(JSON.parse(serialized) as unknown, now);
    if (!recovery) storage.removeItem(STORAGE_KEY);
    return recovery;
  } catch (error) {
    console.warn('[StandardReview] Could not read restart recovery state.', error);
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (removeError) {
      console.warn(
        '[StandardReview] Could not remove invalid recovery state.',
        removeError,
      );
    }
    return null;
  }
}

/** Removes recovery state after persistence succeeds or failure is dismissed. */
export function clearStandardReviewRecovery(
  storage: StandardReviewRecoveryStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[StandardReview] Could not clear restart recovery state.', error);
  }
}
