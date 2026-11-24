import type { CopilotReviewExecutionInput } from '../../hooks/useCopilotReviewMutation';

const STORAGE_KEY = 'copilot-studio-kit:active-copilot-review:v1';
const RECOVERY_VERSION = 1;
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CopilotReviewRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RecoverableCopilotReviewInput {
  botId: string;
  botName: string;
  componentIdUnique: string;
  orgUrl?: string | null;
  sourceEnvironment?: string;
  agentVersion?: string;
}

export interface CopilotReviewRecovery {
  version: 1;
  input: RecoverableCopilotReviewInput;
  environmentId?: string | null;
  returnPath: string;
  startedAt: number;
  jobId?: string;
}

function browserStorage(): CopilotReviewRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('[CopilotReview] Browser storage is unavailable; app restart recovery is disabled.', error);
    return null;
  }
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function parseRecovery(value: unknown, now: number): CopilotReviewRecovery | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CopilotReviewRecovery>;
  const input = candidate.input as Partial<RecoverableCopilotReviewInput> | undefined;

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

  return candidate as CopilotReviewRecovery;
}

/**
 * Creates the restart-safe subset of a Copilot review request.
 *
 * ZIP reviews are excluded because their in-memory file bytes cannot be
 * reconstructed from browser storage.
 */
export function createCopilotReviewRecovery(
  input: CopilotReviewExecutionInput,
  environmentId: string | null | undefined,
  returnPath: string,
  startedAt: number,
): CopilotReviewRecovery | null {
  if (input.zipData) return null;

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

/** Saves the active review before asynchronous work starts. */
export function writeCopilotReviewRecovery(
  recovery: CopilotReviewRecovery,
  storage: CopilotReviewRecoveryStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(recovery));
    return true;
  } catch (error) {
    console.warn('[CopilotReview] Could not save restart recovery state.', error);
    return false;
  }
}

/** Reads a recent, valid review request that did not finish in this browser. */
export function readCopilotReviewRecovery(
  storage: CopilotReviewRecoveryStorage | null = browserStorage(),
  now: number = Date.now(),
): CopilotReviewRecovery | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    const recovery = parseRecovery(JSON.parse(serialized) as unknown, now);
    if (!recovery) storage.removeItem(STORAGE_KEY);
    return recovery;
  } catch (error) {
    console.warn('[CopilotReview] Could not read restart recovery state.', error);
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (removeError) {
      console.warn('[CopilotReview] Could not remove invalid recovery state.', removeError);
    }
    return null;
  }
}

/** Removes recovery state after persistence succeeds or the user dismisses it. */
export function clearCopilotReviewRecovery(
  storage: CopilotReviewRecoveryStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[CopilotReview] Could not clear restart recovery state.', error);
  }
}
